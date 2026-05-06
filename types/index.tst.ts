import { expect } from 'tstyche'
import { parse, safeParse, defaultContentType } from '..'

expect(parse).type.not.toBeCallableWith()
expect(parse).type.not.toBeCallableWith(null)
expect(parse).type.not.toBeCallableWith(123)
expect(parse('string').type).type.toBe<string>()
expect(parse('string').parameters).type.toBe<Record<string, string>>()

expect(safeParse).type.not.toBeCallableWith()
expect(safeParse).type.not.toBeCallableWith(null)
expect(safeParse).type.not.toBeCallableWith(123)

expect(safeParse('string').type).type.toBe<string>()
expect(safeParse('string').parameters).type.toBe<Record<string, string>>()

expect(defaultContentType.type).type.toBe<string>()
expect(defaultContentType.parameters).type.toBe<Record<string, string>>()
