import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const IntakeErrorSchema = Type.Object({
    message: Type.String(),
});

export const IntakeProfileSchema = Type.Object({
    firstName: Type.String({ minLength: 1, maxLength: 120 }),
    lastName: Type.String({ minLength: 1, maxLength: 120 }),
    email: Type.String({ format: 'email', maxLength: 320 }),
    phone: Type.String({ minLength: 7, maxLength: 25, pattern: '^\\+?[\\d\\s\\-().]{7,25}$' }),
    dateOfBirth: Type.Optional(Type.String({ format: 'date' })),
    country: Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
    language: Type.Optional(Type.String({ minLength: 2, maxLength: 50 })),
});

export const IntakeEssaySchema = Type.Object({
    text: Type.String({ minLength: 10, maxLength: 50000 }),
    uploadedAt: Type.String({ format: 'date-time' }),
    version: Type.Number({ minimum: 1 }),
});

export const IntakeVideoSchema = Type.Object({
    url: Type.String({ format: 'uri' }),
    uploadedAt: Type.String({ format: 'date-time' }),
    metadata: Type.Optional(Type.Record(Type.String(), Type.String())),
});

export const IntakeSocialImpactProjectSchema = Type.Object({
    id: Type.Optional(Type.String()),
    name: Type.Optional(Type.String({ maxLength: 200 })),
    role: Type.Optional(Type.String({ maxLength: 200 })),
    year: Type.Optional(Type.String({ maxLength: 10 })),
    description: Type.Optional(Type.String({ maxLength: 1000 })),
    impact: Type.Optional(Type.String({ maxLength: 500 })),
});

export const IntakeSocialImpactSchema = Type.Object({
    projects: Type.Optional(Type.Array(IntakeSocialImpactProjectSchema, { maxItems: 20 })),
    leadershipExample: Type.Optional(Type.String({ maxLength: 2000 })),
    teamworkExample: Type.Optional(Type.String({ maxLength: 2000 })),
});

export const IntakeConsentSchema = Type.Object({
    dataProcessing: Type.Boolean(),
    aiAnalysis: Type.Boolean(),
    versionId: Type.String({ minLength: 1 }),
});

export const IntakeBodySchema = Type.Object({
    profile: IntakeProfileSchema,
    essay: Type.Optional(IntakeEssaySchema),
    video: Type.Optional(IntakeVideoSchema),
    consent: IntakeConsentSchema,
    socialImpact: Type.Optional(IntakeSocialImpactSchema),
});

export const MyIntakeResponseSchema = Type.Object({
    candidateId: Type.String(),
    status: Type.Union([Type.Literal('draft'), Type.Literal('submitted')]),
    completeness: Type.Number({ minimum: 0, maximum: 100 }),
    profile: IntakeProfileSchema,
    essay: Type.Optional(IntakeEssaySchema),
    video: Type.Optional(IntakeVideoSchema),
    consent: IntakeConsentSchema,
    socialImpact: Type.Optional(IntakeSocialImpactSchema),
});

export const IntakeStatusSchema = Type.Union([
    Type.Literal('draft'),
    Type.Literal('submitted'),
]);

export const IntakeResponseSchema = Type.Object({
    candidateId: Type.String(),
    status: IntakeStatusSchema,
    completeness: Type.Number({ minimum: 0, maximum: 100 }),
    issues: Type.Array(Type.String()),
});

export const IntakeStatusFieldSchema = Type.Object({
    name: Type.String(),
    completed: Type.Boolean(),
});

export const IntakeStatusResponseSchema = Type.Object({
    status: IntakeStatusSchema,
    completeness: Type.Number({ minimum: 0, maximum: 100 }),
    fields: Type.Array(IntakeStatusFieldSchema),
});

export const CandidateParamsSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
});

export type IntakeBody = Static<typeof IntakeBodySchema>;
export type IntakeProfile = Static<typeof IntakeProfileSchema>;
export type IntakeEssay = Static<typeof IntakeEssaySchema>;
export type IntakeVideo = Static<typeof IntakeVideoSchema>;
export type IntakeConsent = Static<typeof IntakeConsentSchema>;
export type IntakeStatus = Static<typeof IntakeStatusSchema>;
export type MyIntakeResponse = Static<typeof MyIntakeResponseSchema>;
export type IntakeResponse = Static<typeof IntakeResponseSchema>;
export type IntakeStatusResponse = Static<typeof IntakeStatusResponseSchema>;
export type CandidateParams = Static<typeof CandidateParamsSchema>;
