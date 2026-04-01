import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const ErrorResponseSchema = Type.Object({
    message: Type.String(),
    code: Type.Optional(Type.Union([
        Type.Literal('invalid_credentials'),
        Type.Literal('email_exists'),
        Type.Literal('network'),
        Type.Literal('validation'),
        Type.Literal('unknown'),
    ])),
    fieldErrors: Type.Optional(Type.Record(Type.String(), Type.Array(Type.String()))),
});

export const SignupBodySchema = Type.Object({
    name: Type.String({ minLength: 1, maxLength: 120 }),
    surname: Type.String({ minLength: 1, maxLength: 120 }),
    email: Type.String({ format: 'email', maxLength: 320 }),
    phone: Type.String({ minLength: 7, maxLength: 20, pattern: '^\\+?[0-9]{7,20}$' }),
    password: Type.String({ minLength: 8, maxLength: 72 }),
});

export const SigninBodySchema = Type.Object({
    email: Type.String({ format: 'email', maxLength: 320 }),
    password: Type.String({ minLength: 8, maxLength: 72 }),
});

export const AuthUserSchema = Type.Object({
    id: Type.String(),
    name: Type.String(),
    surname: Type.Optional(Type.String()),
    email: Type.String({ format: 'email' }),
    phone: Type.String(),
});

export const SignupResponseSchema = Type.Object({
    user: AuthUserSchema,
});

export const SigninResponseSchema = Type.Object({
    accessToken: Type.String(),
    user: AuthUserSchema,
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
export type SignupBody = Static<typeof SignupBodySchema>;
export type SigninBody = Static<typeof SigninBodySchema>;
export type AuthUser = Static<typeof AuthUserSchema>;