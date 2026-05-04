import { expect } from 'tstyche'
import { parse, safeParse, defaultContentType } from '..'

// @ts-expect-error!
expect(parse()).type.toBeAssignableTo<{ type: string }>()
// @ts-expect-error!
expect(parse(null)).type.toBeAssignableTo<{ type: string }>()
// @ts-expect-error!
expect(parse(123)).type.toBeAssignableTo<{ type: string }>()

expect(parse('string').type).type.toBe<string>()
expect(parse('string').parameters).type.toBe<Record<string, string>>()

// @ts-expect-error!
expect(safeParse()).type.toBeAssignableTo<{ type: string }>()
// @ts-expect-error!
expect(safeParse(null)).type.toBeAssignableTo<{ type: string }>()
// @ts-expect-error!
expect(safeParse(123)).type.toBeAssignableTo<{ type: string }>()

expect(safeParse('string').type).type.toBe<string>()
expect(safeParse('string').parameters).type.toBe<Record<string, string>>()

expect(defaultContentType.type).type.toBe<string>()
expect(defaultContentType.parameters).type.toBe<Record<string, string>>()
