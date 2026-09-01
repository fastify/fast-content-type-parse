'use strict'

const NullObject = function NullObject () { }
NullObject.prototype = Object.create(null)

const HTAB = 0x09 // '\t'
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
 * Code units above 0xff have no class: header field values are octets.
 *
 * RFC 9110 Section 5.6.2:
 *   tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *         / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *         / DIGIT / ALPHA
 *         ; any VCHAR, except delimiters
 *
 * RFC 9110 Section 5.6.4:
 *   qdtext      = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
 *   quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
 *   obs-text    = %x80-FF
 */
const TCHAR = 1
const QDTEXT = 2
const QUOTED_PAIR = 4
const UPPER = 8

const CHAR_CLASS = new Uint8Array(0x10000)
for (const ch of '!#$%&\'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz') {
  CHAR_CLASS[ch.charCodeAt(0)] = TCHAR
}
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  CHAR_CLASS[ch.charCodeAt(0)] = TCHAR | UPPER
}
CHAR_CLASS[HTAB] |= QDTEXT | QUOTED_PAIR
CHAR_CLASS[SP] |= QDTEXT | QUOTED_PAIR
CHAR_CLASS[0x21] |= QDTEXT | QUOTED_PAIR
CHAR_CLASS[DQUOTE] |= QUOTED_PAIR
for (let i = 0x23; i <= 0x5b; i++) CHAR_CLASS[i] |= QDTEXT | QUOTED_PAIR
CHAR_CLASS[BSLASH] |= QUOTED_PAIR
for (let i = 0x5d; i <= 0x7e; i++) CHAR_CLASS[i] |= QDTEXT | QUOTED_PAIR
for (let i = 0x80; i <= 0xff; i++) CHAR_CLASS[i] |= QDTEXT | QUOTED_PAIR

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
 * Parse media type to object, following RFC 9110 Section 8.3.1:
 *
 *   media-type      = type "/" subtype parameters
 *   type            = token
 *   subtype         = token
 *   parameters      = *( OWS ";" OWS [ parameter ] )
 *   parameter       = parameter-name "=" parameter-value
 *   parameter-name  = token
 *   parameter-value = ( token / quoted-string )
 *   OWS             = *( SP / HTAB )
 *
 * Leading and trailing OWS is tolerated, as a field parser is required to
 * strip it before evaluating the field value (RFC 9110 Section 5.5).
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

  // leading OWS
  while (index < len) {
    code = header.charCodeAt(index)
    if (code !== SP && code !== HTAB) break
    index++
  }

  // type "/" subtype
  const typeStart = index
  let upper = 0
  while (index < len) {
    code = header.charCodeAt(index)
    flags = CHAR_CLASS[code]
    if ((flags & TCHAR) === 0) break
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
    if ((flags & TCHAR) === 0) break
    upper |= flags
    index++
  }

  if (index === subtypeStart) {
    return defaultContentType
  }

  const typeEnd = index

  // OWS
  while (index < len) {
    code = header.charCodeAt(index)
    if (code !== SP && code !== HTAB) break
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

  const parameters = result.parameters

  // *( OWS ";" OWS [ parameter ] )
  while (index < len) {
    index++ // skip ";"

    // OWS
    while (index < len) {
      code = header.charCodeAt(index)
      if (code !== SP && code !== HTAB) break
      index++
    }

    // empty parameter: trailing ";" or ";;"
    if (index === len) {
      return result
    }
    if (code === SEMI) {
      continue
    }

    // parameter-name
    const keyStart = index
    upper = 0
    while (index < len) {
      code = header.charCodeAt(index)
      flags = CHAR_CLASS[code]
      if ((flags & TCHAR) === 0) break
      upper |= flags
      index++
    }

    if (index === keyStart || index === len || code !== EQ) {
      return invalidParameterFormat
    }

    const key = header.slice(keyStart, index)
    index++ // skip "="

    // parameter-value
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
        if (index === len || (CHAR_CLASS[header.charCodeAt(index)] & QUOTED_PAIR) === 0) {
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
      // token
      const valueStart = index
      while (index < len && (CHAR_CLASS[header.charCodeAt(index)] & TCHAR) !== 0) {
        index++
      }

      if (index === valueStart) {
        return invalidParameterFormat
      }

      value = header.slice(valueStart, index)
    }

    // OWS
    while (index < len) {
      code = header.charCodeAt(index)
      if (code !== SP && code !== HTAB) break
      index++
    }

    if (index !== len && code !== SEMI) {
      return invalidParameterFormat
    }

    // parameter names are case-insensitive; the first occurrence wins,
    // matching util.MIMEType, the WHATWG MIME Sniffing standard and content-type
    const name = (upper & UPPER) !== 0 ? key.toLowerCase() : key
    if (parameters[name] === undefined) {
      parameters[name] = value
    }
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
