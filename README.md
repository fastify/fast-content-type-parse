# fast-content-type-parse

[![NPM version](https://img.shields.io/npm/v/fast-content-type-parse.svg?style=flat)](https://www.npmjs.com/package/fast-content-type-parse)
[![NPM downloads](https://img.shields.io/npm/dm/fast-content-type-parse.svg?style=flat)](https://www.npmjs.com/package/fast-content-type-parse)
[![CI](https://github.com/fastify/fast-content-type-parse/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/fast-content-type-parse/actions/workflows/ci.yml)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)
[![Security Responsible Disclosure](https://img.shields.io/badge/Security-Responsible%20Disclosure-yellow.svg)](https://github.com/fastify/.github/blob/main/SECURITY.md)

Parse HTTP Content-Type header according to [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#section-8.3.1).

## Installation

```sh
npm install fast-content-type-parse
```

## Usage

```js
const fastContentTypeParse = require('fast-content-type-parse')
```

### fastContentTypeParse.parse(string)

```js
const contentType = fastContentTypeParse.parse('application/json; charset=utf-8')
```

Parse a `Content-Type` header. Throws a `TypeError` if the string is invalid.

It will return an object with the following properties (examples are shown for
the string `'application/json; charset=utf-8'`):

- `type`: The media type (the type and subtype, always lowercase).
   Example: `'application/json'`

- `parameters`: An object of the parameters in the media type (name of parameter
   always lowercase). Example: `{charset: 'utf-8'}`

### fastContentTypeParse.safeParse(string)

```js
const contentType = fastContentTypeParse.safeParse('application/json; charset=utf-8')
```

Parse a `Content-Type` header. It will not throw an Error if the header is invalid.

This will return an object with the following
properties (examples are shown for the string `'application/json; charset=utf-8'`):

- `type`: The media type (the type and subtype, always lowercase).
   Example: `'application/json'`

- `parameters`: An object of the parameters in the media type (name of parameter
   always lowercase). Example: `{charset: 'utf-8'}`

In case the header is invalid, it will return an object
with an empty string `''` as type and an empty Object for `parameters`.

## Grammar

The parser implements the `media-type` grammar of
[RFC 9110 Section 8.3.1](https://www.rfc-editor.org/rfc/rfc9110#section-8.3.1)
exactly, without extensions:

```
media-type      = type "/" subtype parameters
type            = token
subtype         = token
parameters      = *( OWS ";" OWS [ parameter ] )
parameter       = parameter-name "=" parameter-value
parameter-name  = token
parameter-value = ( token / quoted-string )
OWS             = *( SP / HTAB )
```

In particular:

- Only spaces and horizontal tabs (`OWS`) are accepted around the media type
  and the `;` separators. Any other whitespace, including `CR`, `LF` and
  Unicode whitespace, is rejected.
- Empty parameters (`text/html;`, `text/html; ; charset=utf-8`) are accepted,
  as allowed by RFC 9110.
- `type`, `subtype` and parameter names are case-insensitive and are
  lower-cased. Parameter values are returned as-is.
- Quoted-pairs in `quoted-string` values are unescaped.
- When a parameter appears more than once, the first occurrence wins, matching
  `util.MIMEType`, the [WHATWG MIME Sniffing Standard](https://mimesniff.spec.whatwg.org/#parsing-a-mime-type)
  and the `content-type` package.
- `parameters` is a null-prototype object, so parameter names such as
  `__proto__` or `constructor` are ordinary keys.

## Benchmarks

```sh
npm run benchmark

Benchmarking: "application/json; charset=utf-8"
util#MIMEType x 2,637,188 ops/sec ±0.95% (93 runs sampled)
fast-content-type-parse#parse x 5,165,077 ops/sec ±0.75% (95 runs sampled)
fast-content-type-parse#safeParse x 5,189,599 ops/sec ±0.72% (94 runs sampled)
content-type#parse x 4,227,069 ops/sec ±0.79% (96 runs sampled)
busboy#parseContentType x 777,787 ops/sec ±0.75% (91 runs sampled)
Fastest is fast-content-type-parse#safeParse,fast-content-type-parse#parse
```

## Credits

Based on the npm package `content-type`.

## License

Licensed under [MIT](./LICENSE).
