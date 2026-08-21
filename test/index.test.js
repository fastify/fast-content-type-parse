'use strict'

const { test } = require('node:test')
const { parse, safeParse, defaultContentType } = require('..')

const invalidTypes = [
  '',
  ' ',
  '\t',
  'null',
  'undefined',
  '/',
  'text/',
  '/plain',
  'text / plain',
  'text/;plain',
  'text/"plain"',
  'text/p\u00a3ain',
  'text/(plain)',
  'text/@plain',
  'text/plain,wrong',
  'text/plain/wrong',
  'text/plain wrong',
  // only OWS (SP / HTAB) may surround the media type
  '\r\ntext/html\r\n',
  '\ntext/html',
  'text/html\n',
  'text/html\r',
  'text/html\x0b',
  'text/html\x0c',
  'text/html\n; charset=utf-8',
  '\u00a0text/html\u00a0',
  '\u2003text/html\u2003',
  '\u3000text/html\ufeff',
  '\u2028text/html\u2029',
  '\ufefftext/html'
]

const invalidParameters = [
  'text/plain; foo="bar',
  'text/plain; profile=http://localhost; foo=bar',
  'text/plain; profile=http://localhost',
  'text/plain; foo',
  'text/plain; =bar',
  'text/plain; foo ="bar"',
  'text/plain; foo= bar',
  'text/plain; foo=',
  'text/plain; foo=;',
  'text/plain; foo=bar baz',
  'text/plain; foo=bar\n',
  'text/plain; foo=bar\r\n',
  'text/plain; foo=bar\x0b',
  'text/plain; foo="bar"baz',
  'text/plain; foo="bar" baz',
  'text/plain; foo="bar\\',
  'text/plain; foo="bar\\"',
  'text/plain; foo="b\x0bar"',
  'text/plain; foo="ba\\\x0br"',
  'text/plain; foo="b\x7far"',
  'text/plain; foo="ba\\\x7fr"',
  'text/plain; foo="b\nar"',
  'text/plain; foo="ba\\\nr"',
  'text/plain; foo="b\u0100ar"',
  'text/plain; foo="ba\\\u0100r"',
  'text/plain; foo=b\xffar',
  'text/plain; fo\xffo=bar',
  'text/plain; foo="bar"; =baz',
  'text/plain; foo=bar; baz',
  'text/plain; foo=bar, baz=qux'
]

test('parse', async function (t) {
  t.plan(19 + invalidTypes.length)
  await t.test('should parse basic type', function (t) {
    t.plan(1)
    const type = parse('text/html')
    t.assert.deepStrictEqual(type.type, 'text/html')
  })

  await t.test('should parse with suffix', function (t) {
    t.plan(1)
    const type = parse('image/svg+xml')
    t.assert.deepStrictEqual(type.type, 'image/svg+xml')
  })

  await t.test('should parse every tchar in type, subtype and parameters', function (t) {
    t.plan(2)
    const tchars = '!#$%&\'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz'
    const type = parse(`${tchars}/${tchars}; ${tchars}=${tchars}`)
    t.assert.deepStrictEqual(type.type, `${tchars}/${tchars}`)
    t.assert.deepEqual(type.parameters, { [tchars]: tchars })
  })

  await t.test('should parse basic type with surrounding OWS', function (t) {
    t.plan(4)
    t.assert.deepStrictEqual(parse(' text/html ').type, 'text/html')
    t.assert.deepStrictEqual(parse('\ttext/html\t').type, 'text/html')
    t.assert.deepStrictEqual(parse(' \t text/html \t ').type, 'text/html')
    t.assert.deepEqual(parse('\ttext/html\t;\tcharset=utf-8\t').parameters, { charset: 'utf-8' })
  })

  await t.test('should parse parameters', function (t) {
    t.plan(2)
    const type = parse('text/html; charset=utf-8; foo=bar')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'utf-8',
      foo: 'bar'
    })
  })

  await t.test('should parse parameters with extra OWS', function (t) {
    t.plan(4)
    t.assert.deepEqual(parse('text/html ; charset=utf-8 ; foo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
    t.assert.deepEqual(parse('text/html\t;\tcharset=utf-8\t;\tfoo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
    t.assert.deepEqual(parse('text/html;charset=utf-8;foo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
    t.assert.deepEqual(parse('text/html \t ; \t charset="utf-8" \t ; \t foo=bar \t ').parameters, { charset: 'utf-8', foo: 'bar' })
  })

  await t.test('should parse empty parameters', function (t) {
    t.plan(7)
    t.assert.deepEqual(parse('text/html;').parameters, {})
    t.assert.deepEqual(parse('text/html; ').parameters, {})
    t.assert.deepEqual(parse('text/html ;').parameters, {})
    t.assert.deepEqual(parse('text/html;;;').parameters, {})
    t.assert.deepEqual(parse('text/html; ; charset=utf-8').parameters, { charset: 'utf-8' })
    t.assert.deepEqual(parse('text/html; charset=utf-8;').parameters, { charset: 'utf-8' })
    t.assert.deepEqual(parse('text/html; charset=utf-8; ; foo=bar ; ;').parameters, { charset: 'utf-8', foo: 'bar' })
  })

  await t.test('should keep the first occurrence of a duplicate parameter', function (t) {
    t.plan(2)
    t.assert.deepEqual(parse('text/html; charset=utf-8; charset=latin1').parameters, { charset: 'utf-8' })
    t.assert.deepEqual(parse('text/html; charset=utf-8; CHARSET="latin1"; foo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
  })

  await t.test('should not be confused by special property names', function (t) {
    t.plan(3)
    const type = parse('text/html; __proto__=a; constructor=b; hasownproperty=c')
    t.assert.deepStrictEqual(Object.getPrototypeOf(Object.getPrototypeOf(type.parameters)), null)
    t.assert.deepStrictEqual(Object.keys(type.parameters), ['__proto__', 'constructor', 'hasownproperty'])
    t.assert.deepStrictEqual(Object.getOwnPropertyDescriptor(type.parameters, '__proto__').value, 'a')
  })

  await t.test('should lower-case type', function (t) {
    t.plan(1)
    const type = parse('IMAGE/SVG+XML')
    t.assert.deepStrictEqual(type.type, 'image/svg+xml')
  })

  await t.test('should lower-case parameter names', function (t) {
    t.plan(2)
    const type = parse('text/html; Charset=UTF-8')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'UTF-8'
    })
  })

  await t.test('should unquote parameter values', function (t) {
    t.plan(3)
    const type = parse('text/html; charset="UTF-8"')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'UTF-8'
    })
    t.assert.deepEqual(parse('text/html; foo=""').parameters, { foo: '' })
  })

  await t.test('should unquote parameter values with escapes', function (t) {
    t.plan(2)
    const type = parse('text/html; charset="UT\\F-\\\\\\"8\\""')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'UTF-\\"8"'
    })
  })

  await t.test('should accept qdtext and quoted-pair characters', function (t) {
    t.plan(5)
    t.assert.deepEqual(parse('text/plain; foo="b\tar"').parameters, { foo: 'b\tar' })
    t.assert.deepEqual(parse('text/plain; foo="ba\\\tr"').parameters, { foo: 'ba\tr' })
    t.assert.deepEqual(parse('text/plain; foo="b ar\\ "').parameters, { foo: 'b ar ' })
    t.assert.deepEqual(parse('text/plain; foo="\x80\xff\\\x80\\\xff"').parameters, { foo: '\x80\xff\x80\xff' })
    t.assert.deepEqual(parse('text/plain; foo="\\!\\~"').parameters, { foo: '!~' })
  })

  await t.test('should handle balanced quotes', function (t) {
    t.plan(2)
    const type = parse('text/html; param="charset=\\"utf-8\\"; foo=bar"; bar=foo')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      param: 'charset="utf-8"; foo=bar',
      bar: 'foo'
    })
  })

  await t.test('should return a null prototype parameters object', function (t) {
    t.plan(2)
    const type = parse('text/html; charset=utf-8')
    t.assert.deepStrictEqual(Object.getPrototypeOf(Object.getPrototypeOf(type.parameters)), null)
    t.assert.deepStrictEqual(typeof type.parameters.toString, 'undefined')
  })

  invalidTypes.forEach(async function (type) {
    await t.test('should throw on invalid media type ' + JSON.stringify(type), function (t) {
      t.plan(1)
      t.assert.throws(parse.bind(null, type), new TypeError('invalid media type'))
    })
  })

  await t.test('should throw on invalid parameter format', function (t) {
    t.plan(invalidParameters.length)
    for (const header of invalidParameters) {
      t.assert.throws(parse.bind(null, header), new TypeError('invalid parameter format'), JSON.stringify(header))
    }
  })

  await t.test('should require argument', function (t) {
    t.plan(1)
    // @ts-expect-error should reject non-strings
    t.assert.throws(parse.bind(null), new TypeError('argument header is required and must be a string'))
  })

  await t.test('should reject non-strings', function (t) {
    t.plan(1)
    // @ts-expect-error should reject non-strings
    t.assert.throws(parse.bind(null, 7), new TypeError('argument header is required and must be a string'))
  })
})

test('safeParse', async function (t) {
  t.plan(19 + invalidTypes.length)
  await t.test('should safeParse basic type', function (t) {
    t.plan(1)
    const type = safeParse('text/html')
    t.assert.deepStrictEqual(type.type, 'text/html')
  })

  await t.test('should safeParse with suffix', function (t) {
    t.plan(1)
    const type = safeParse('image/svg+xml')
    t.assert.deepStrictEqual(type.type, 'image/svg+xml')
  })

  await t.test('should safeParse every tchar in type, subtype and parameters', function (t) {
    t.plan(2)
    const tchars = '!#$%&\'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz'
    const type = safeParse(`${tchars}/${tchars}; ${tchars}=${tchars}`)
    t.assert.deepStrictEqual(type.type, `${tchars}/${tchars}`)
    t.assert.deepEqual(type.parameters, { [tchars]: tchars })
  })

  await t.test('should safeParse basic type with surrounding OWS', function (t) {
    t.plan(4)
    t.assert.deepStrictEqual(safeParse(' text/html ').type, 'text/html')
    t.assert.deepStrictEqual(safeParse('\ttext/html\t').type, 'text/html')
    t.assert.deepStrictEqual(safeParse(' \t text/html \t ').type, 'text/html')
    t.assert.deepEqual(safeParse('\ttext/html\t;\tcharset=utf-8\t').parameters, { charset: 'utf-8' })
  })

  await t.test('should safeParse parameters', function (t) {
    t.plan(2)
    const type = safeParse('text/html; charset=utf-8; foo=bar')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'utf-8',
      foo: 'bar'
    })
  })

  await t.test('should safeParse parameters with extra OWS', function (t) {
    t.plan(4)
    t.assert.deepEqual(safeParse('text/html ; charset=utf-8 ; foo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
    t.assert.deepEqual(safeParse('text/html\t;\tcharset=utf-8\t;\tfoo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
    t.assert.deepEqual(safeParse('text/html;charset=utf-8;foo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
    t.assert.deepEqual(safeParse('text/html \t ; \t charset="utf-8" \t ; \t foo=bar \t ').parameters, { charset: 'utf-8', foo: 'bar' })
  })

  await t.test('should safeParse empty parameters', function (t) {
    t.plan(7)
    t.assert.deepEqual(safeParse('text/html;').parameters, {})
    t.assert.deepEqual(safeParse('text/html; ').parameters, {})
    t.assert.deepEqual(safeParse('text/html ;').parameters, {})
    t.assert.deepEqual(safeParse('text/html;;;').parameters, {})
    t.assert.deepEqual(safeParse('text/html; ; charset=utf-8').parameters, { charset: 'utf-8' })
    t.assert.deepEqual(safeParse('text/html; charset=utf-8;').parameters, { charset: 'utf-8' })
    t.assert.deepEqual(safeParse('text/html; charset=utf-8; ; foo=bar ; ;').parameters, { charset: 'utf-8', foo: 'bar' })
  })

  await t.test('should keep the first occurrence of a duplicate parameter', function (t) {
    t.plan(2)
    t.assert.deepEqual(safeParse('text/html; charset=utf-8; charset=latin1').parameters, { charset: 'utf-8' })
    t.assert.deepEqual(safeParse('text/html; charset=utf-8; CHARSET="latin1"; foo=bar').parameters, { charset: 'utf-8', foo: 'bar' })
  })

  await t.test('should not be confused by special property names', function (t) {
    t.plan(3)
    const type = safeParse('text/html; __proto__=a; constructor=b; hasownproperty=c')
    t.assert.deepStrictEqual(Object.getPrototypeOf(Object.getPrototypeOf(type.parameters)), null)
    t.assert.deepStrictEqual(Object.keys(type.parameters), ['__proto__', 'constructor', 'hasownproperty'])
    t.assert.deepStrictEqual(Object.getOwnPropertyDescriptor(type.parameters, '__proto__').value, 'a')
  })

  await t.test('should lower-case type', function (t) {
    t.plan(1)
    const type = safeParse('IMAGE/SVG+XML')
    t.assert.deepStrictEqual(type.type, 'image/svg+xml')
  })

  await t.test('should lower-case parameter names', function (t) {
    t.plan(2)
    const type = safeParse('text/html; Charset=UTF-8')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'UTF-8'
    })
  })

  await t.test('should unquote parameter values', function (t) {
    t.plan(3)
    const type = safeParse('text/html; charset="UTF-8"')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'UTF-8'
    })
    t.assert.deepEqual(safeParse('text/html; foo=""').parameters, { foo: '' })
  })

  await t.test('should unquote parameter values with escapes', function (t) {
    t.plan(2)
    const type = safeParse('text/html; charset="UT\\F-\\\\\\"8\\""')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      charset: 'UTF-\\"8"'
    })
  })

  await t.test('should accept qdtext and quoted-pair characters', function (t) {
    t.plan(5)
    t.assert.deepEqual(safeParse('text/plain; foo="b\tar"').parameters, { foo: 'b\tar' })
    t.assert.deepEqual(safeParse('text/plain; foo="ba\\\tr"').parameters, { foo: 'ba\tr' })
    t.assert.deepEqual(safeParse('text/plain; foo="b ar\\ "').parameters, { foo: 'b ar ' })
    t.assert.deepEqual(safeParse('text/plain; foo="\x80\xff\\\x80\\\xff"').parameters, { foo: '\x80\xff\x80\xff' })
    t.assert.deepEqual(safeParse('text/plain; foo="\\!\\~"').parameters, { foo: '!~' })
  })

  await t.test('should handle balanced quotes', function (t) {
    t.plan(2)
    const type = safeParse('text/html; param="charset=\\"utf-8\\"; foo=bar"; bar=foo')
    t.assert.deepStrictEqual(type.type, 'text/html')
    t.assert.deepEqual(type.parameters, {
      param: 'charset="utf-8"; foo=bar',
      bar: 'foo'
    })
  })

  await t.test('should return a null prototype parameters object', function (t) {
    t.plan(2)
    const type = safeParse('text/html; charset=utf-8')
    t.assert.deepStrictEqual(Object.getPrototypeOf(Object.getPrototypeOf(type.parameters)), null)
    t.assert.deepStrictEqual(typeof type.parameters.toString, 'undefined')
  })

  invalidTypes.forEach(async function (type) {
    await t.test('should return defaultContentType on invalid media type ' + JSON.stringify(type), function (t) {
      t.plan(3)
      t.assert.strictEqual(safeParse(type), defaultContentType)
      t.assert.deepStrictEqual(safeParse(type).type, '')
      t.assert.deepStrictEqual(Object.keys(safeParse(type).parameters).length, 0)
    })
  })

  await t.test('should return defaultContentType on invalid parameter format', function (t) {
    t.plan(invalidParameters.length * 3)
    for (const header of invalidParameters) {
      t.assert.strictEqual(safeParse(header), defaultContentType, JSON.stringify(header))
      t.assert.deepStrictEqual(safeParse(header).type, '')
      t.assert.deepStrictEqual(Object.keys(safeParse(header).parameters).length, 0)
    }
  })

  await t.test('should return defaultContentType on missing argument', function (t) {
    t.plan(2)
    // @ts-expect-error should reject non-strings
    t.assert.deepStrictEqual(safeParse().type, '')
    // @ts-expect-error should reject non-strings
    t.assert.deepStrictEqual(Object.keys(safeParse().parameters).length, 0)
  })

  await t.test('should return defaultContentType on non-strings', function (t) {
    t.plan(2)
    // @ts-expect-error should reject non-strings
    t.assert.deepStrictEqual(safeParse(null).type, '')
    // @ts-expect-error should reject non-strings
    t.assert.deepStrictEqual(Object.keys(safeParse(null).parameters).length, 0)
  })
})
