import { ObjectId, type Collection } from 'mongodb';
import type {
    IntakeBody,
    IntakeResponse,
    IntakeStatusResponse,
} from '../schemas/intake.schema.js';

export type IntakeDocument = IntakeBody & {
    _id?: ObjectId;
    userId: string;
    status: 'draft' | 'submitted';
    completeness: number;
    issues: string[];
    createdAt: Date;
    updatedAt: Date;
};

export type IntakeVersionDocument = {
    candidateId: ObjectId;
    version: number;
    payload: IntakeBody;
    createdAt: Date;
};

export type IntakeAuditDocument = {
    candidateId: ObjectId;
    userId: string;
    action: 'created' | 'updated';
    createdAt: Date;
};

function normalizeBody(body: IntakeBody): IntakeBody {
    const profile = {
        ...body.profile,
        email: body.profile.email.trim().toLowerCase(),
        phone: body.profile.phone.trim(),
        firstName: body.profile.firstName.trim(),
        lastName: body.profile.lastName.trim(),
    };

    if (typeof body.profile.country !== 'undefined') {
        profile.country = body.profile.country.trim();
    }

    if (typeof body.profile.language !== 'undefined') {
        profile.language = body.profile.language.trim();
    }

    const normalized: IntakeBody = {
        ...body,
        profile,
    };

    if (body.essay) {
        normalized.essay = {
            ...body.essay,
            text: body.essay.text.trim(),
        };
    }

    return normalized;
}

function computeIssues(body: IntakeBody): string[] {
    const issues: string[] = [];

    if (!body.consent.dataProcessing) {
        issues.push('consent.dataProcessing must be true');
    }
    if (!body.consent.aiAnalysis) {
        issues.push('consent.aiAnalysis must be true');
    }

    return issues;
}

function computeCompleteness(body: IntakeBody): number {
    const fields = [
        body.profile.firstName.length > 0,
        body.profile.lastName.length > 0,
        body.profile.email.length > 0,
        body.profile.phone.length > 0,
        Boolean(body.essay?.text),
        Boolean(body.video?.url),
        body.consent.dataProcessing,
        body.consent.aiAnalysis,
    ];

    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
}

function toDto(doc: IntakeDocument & { _id: ObjectId }): IntakeResponse {
    return {
        candidateId: doc._id.toHexString(),
        status: doc.status,
        completeness: doc.completeness,
        issues: doc.issues,
    };
}

function toStatusDto(doc: IntakeDocument): IntakeStatusResponse {
    return {
        status: doc.status,
        completeness: doc.completeness,
        fields: [
            { name: 'profile.firstName', completed: doc.profile.firstName.length > 0 },
            { name: 'profile.lastName', completed: doc.profile.lastName.length > 0 },
            { name: 'profile.email', completed: doc.profile.email.length > 0 },
            { name: 'profile.phone', completed: doc.profile.phone.length > 0 },
            { name: 'essay.text', completed: Boolean(doc.essay?.text) },
            { name: 'video.url', completed: Boolean(doc.video?.url) },
            { name: 'consent.dataProcessing', completed: doc.consent.dataProcessing },
            { name: 'consent.aiAnalysis', completed: doc.consent.aiAnalysis },
        ],
    };
}

export function createIntakeService(
    intakeCollection: Collection<IntakeDocument>,
    versionsCollection: Collection<IntakeVersionDocument>,
    auditCollection: Collection<IntakeAuditDocument>,
) {
    return {
        async upsertIntake(userId: string, body: IntakeBody): Promise<IntakeResponse> {
            const normalized = normalizeBody(body);
            const issues = computeIssues(normalized);
            const completeness = computeCompleteness(normalized);
            const now = new Date();

            const existing = await intakeCollection.findOne({ userId });

            if (!existing) {
                const created = await intakeCollection.insertOne({
                    ...normalized,
                    userId,
                    status: 'draft',
                    completeness,
                    issues,
                    createdAt: now,
                    updatedAt: now,
                });

                await versionsCollection.insertOne({
                    candidateId: created.insertedId,
                    version: 1,
                    payload: normalized,
                    createdAt: now,
                });

                await auditCollection.insertOne({
                    candidateId: created.insertedId,
                    userId,
                    action: 'created',
                    createdAt: now,
                });

                const doc = await intakeCollection.findOne({ _id: created.insertedId });
                if (!doc) {
                    throw new Error('Failed to create intake');
                }
                return toDto(doc as IntakeDocument & { _id: ObjectId });
            }

            const candidateId = existing._id;
            if (!candidateId) {
                throw new Error('Invalid intake document');
            }

            const latestVersion = await versionsCollection.find({ candidateId }).sort({ version: -1 }).limit(1).next();
            const nextVersion = (latestVersion?.version ?? 0) + 1;

            await intakeCollection.updateOne(
                { _id: candidateId },
                {
                    $set: {
                        ...normalized,
                        completeness,
                        issues,
                        updatedAt: now,
                    },
                },
            );

            await versionsCollection.insertOne({
                candidateId,
                version: nextVersion,
                payload: normalized,
                createdAt: now,
            });

            // Essay history is tracked in version snapshots; timestamps come from essay.uploadedAt and version records.
            await auditCollection.insertOne({
                candidateId,
                userId,
                action: 'updated',
                createdAt: now,
            });

            const updated = await intakeCollection.findOne({ _id: candidateId });
            if (!updated) {
                throw new Error('Failed to update intake');
            }

            return toDto(updated as IntakeDocument & { _id: ObjectId });
        },

        async getStatus(candidateId: string, userId: string, isAdmin: boolean): Promise<IntakeStatusResponse> {
            if (!ObjectId.isValid(candidateId)) {
                throw new Error('Invalid candidate id');
            }

            const doc = await intakeCollection.findOne({ _id: new ObjectId(candidateId) });
            if (!doc) {
                throw new Error('Candidate not found');
            }

            if (!isAdmin && doc.userId !== userId) {
                throw new Error('Forbidden');
            }

            return toStatusDto(doc);
        },
    };
}

export type IntakeService = ReturnType<typeof createIntakeService>;
