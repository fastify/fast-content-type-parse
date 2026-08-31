'use strict'

const NullObject = function NullObject () { }
NullObject.prototype = Object.create(null)

const SP = 0x20 // ' '
const SEMI = 0x3b // ';'
const EQ = 0x3d // '='
const SLASH = 0x2f // '/'
const DQUOTE = 0x22 // '"'
const BSLASH = 0x5c // '\'

/**
 * Character class lookup table, indexed by UTF-16 code unit. It covers the
 * whole code unit range so that lookups are never out of bounds and always
 * yield a small integer, which keeps the scanning loops on V8's fast path.
 *
 * tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *       / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *       / DIGIT / ALPHA
 *       ; any VCHAR, except delimiters
 *
 * qdtext = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
 * obs-text = %x80-FF
 *
 * MEDIA_TYPE_TCHAR intentionally omits "`" and QDTEXT accepts VT (0x0b)
 * rather than HTAB, to keep the behaviour of the regular expressions that
 * were previously used for validation.
 */
const MEDIA_TYPE_TCHAR = 1
const PARAM_TCHAR = 2
const QDTEXT = 4
const UPPER = 8

const CHAR_CLASS = new Uint8Array(0x10000)
for (const ch of '!#$%&\'*+-.^_|~0123456789abcdefghijklmnopqrstuvwxyz') {
  CHAR_CLASS[ch.charCodeAt(0)] = MEDIA_TYPE_TCHAR | PARAM_TCHAR
}
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  CHAR_CLASS[ch.charCodeAt(0)] = MEDIA_TYPE_TCHAR | PARAM_TCHAR | UPPER
}
CHAR_CLASS[0x60] = PARAM_TCHAR // '`'
CHAR_CLASS[0x0b] |= QDTEXT
CHAR_CLASS[0x20] |= QDTEXT
CHAR_CLASS[0x21] |= QDTEXT
for (let i = 0x23; i <= 0x5b; i++) CHAR_CLASS[i] |= QDTEXT
for (let i = 0x5d; i <= 0x7e; i++) CHAR_CLASS[i] |= QDTEXT
for (let i = 0x80; i <= 0xff; i++) CHAR_CLASS[i] |= QDTEXT

/**
 * Whitespace as removed by `String.prototype.trim()`: WhiteSpace and
 * LineTerminator code points per ECMA-262.
 */
function isTrimWhitespace (code) {
  if (code <= 0x20) {
    return code === 0x20 || (code >= 0x09 && code <= 0x0d)
  }
  if (code < 0xa0) {
    return false
  }
  return code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
}

/**
 * Remove the backslashes of the quoted-pairs in header[start, end).
 * The range is known to be a valid quoted-string body.
 */
function unescapeQuotedPairs (header, start, end) {
  let value = ''
  let index = start
  while (index < end) {
    if (header.charCodeAt(index) === BSLASH) {
      value += header.slice(start, index)
      start = ++index
    }
    index++
  }
  return value + header.slice(start, end)
}

// default ContentType to prevent repeated object creation
const defaultContentType = { type: '', parameters: new NullObject() }
Object.freeze(defaultContentType.parameters)
Object.freeze(defaultContentType)

// sentinel returned by parseHeader when the parameters are malformed
const invalidParameterFormat = { type: '', parameters: defaultContentType.parameters }
Object.freeze(invalidParameterFormat)

/**
 * Parse media type to object.
 *
 * Returns `defaultContentType` when the media type is invalid and
 * `invalidParameterFormat` when the parameters are malformed.
 *
 * @param {string} header
 * @return {Object}
 */
function parseHeader (header) {
  const len = header.length
  let index = 0
  let code = 0
  let flags = 0

  // skip leading whitespace
  while (index < len) {
    code = header.charCodeAt(index)
    if (!isTrimWhitespace(code)) break
    index++
  }

  // media-type = type "/" subtype
  const typeStart = index
  let upper = 0
  while (index < len) {
    code = header.charCodeAt(index)
    flags = CHAR_CLASS[code]
    if ((flags & MEDIA_TYPE_TCHAR) === 0) break
    upper |= flags
    index++
  }

  if (index === typeStart || index === len || code !== SLASH) {
    return defaultContentType
  }

  index++ // skip "/"
  const subtypeStart = index
  while (index < len) {
    code = header.charCodeAt(index)
    flags = CHAR_CLASS[code]
    if ((flags & MEDIA_TYPE_TCHAR) === 0) break
    upper |= flags
    index++
  }

  if (index === subtypeStart) {
    return defaultContentType
  }

  const typeEnd = index

  // skip trailing whitespace
  while (index < len) {
    code = header.charCodeAt(index)
    if (!isTrimWhitespace(code)) break
    index++
  }

  if (index !== len && code !== SEMI) {
    return defaultContentType
  }

  const type = header.slice(typeStart, typeEnd)
  const result = {
    type: (upper & UPPER) !== 0 ? type.toLowerCase() : type,
    parameters: new NullObject()
  }

  if (index === len) {
    return result
  }

  // parse parameters
  const parameters = result.parameters

  // *( ";" parameter )
  // parameter     = token "=" ( token / quoted-string )
  while (index < len) {
    index++ // skip ";"
    while (index < len && header.charCodeAt(index) === SP) {
      index++
    }

    const keyStart = index
    upper = 0
    while (index < len) {
      code = header.charCodeAt(index)
      flags = CHAR_CLASS[code]
      if ((flags & PARAM_TCHAR) === 0) break
      upper |= flags
      index++
    }

    if (index === keyStart || index === len || code !== EQ) {
      return invalidParameterFormat
    }

    const key = header.slice(keyStart, index)
    index++ // skip "="

    let value
    if (index < len && header.charCodeAt(index) === DQUOTE) {
      // quoted-string = DQUOTE *( qdtext / quoted-pair ) DQUOTE
      index++
      const valueStart = index
      let escaped = false
      while (index < len) {
        code = header.charCodeAt(index)
        if (code === DQUOTE) break
        if ((CHAR_CLASS[code] & QDTEXT) !== 0) {
          index++
          continue
        }
        if (code !== BSLASH) {
          return invalidParameterFormat
        }
        // quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
        index++
        if (index === len) {
          return invalidParameterFormat
        }
        code = header.charCodeAt(index)
        if (!(code === 0x0b || (code >= 0x20 && code <= 0xff))) {
          return invalidParameterFormat
        }
        escaped = true
        index++
      }

      if (index === len) {
        return invalidParameterFormat
      }

      value = escaped
        ? unescapeQuotedPairs(header, valueStart, index)
        : header.slice(valueStart, index)
      index++ // skip closing DQUOTE
    } else {
      const valueStart = index
      while (index < len && (CHAR_CLASS[header.charCodeAt(index)] & PARAM_TCHAR) !== 0) {
        index++
      }

      if (index === valueStart) {
        return invalidParameterFormat
      }

      value = header.slice(valueStart, index)
    }

    while (index < len && header.charCodeAt(index) === SP) {
      index++
    }

    if (index !== len && header.charCodeAt(index) !== SEMI) {
      return invalidParameterFormat
    }

    parameters[(upper & UPPER) !== 0 ? key.toLowerCase() : key] = value
  }

  return result
}

/**
 * Parse media type to object.
 *
 * @param {string|object} header
 * @return {Object}
 * @public
 */

function parse (header) {
  if (typeof header !== 'string') {
    throw new TypeError('argument header is required and must be a string')
  }

  const result = parseHeader(header)

  if (result === defaultContentType) {
    throw new TypeError('invalid media type')
  }

  if (result === invalidParameterFormat) {
    throw new TypeError('invalid parameter format')
  }

  return result
}

function safeParse (header) {
  if (typeof header !== 'string') {
    return defaultContentType
  }

  const result = parseHeader(header)

  if (result === invalidParameterFormat) {
    return defaultContentType
  }

  return result
}

module.exports.default = { parse, safeParse }
module.exports.parse = parse
module.exports.safeParse = safeParse
module.exports.defaultContentType = defaultContentType
