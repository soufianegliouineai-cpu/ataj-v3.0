import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { SupportedDocumentType } from '../constants.js';

const DAY_MS = 86_400_000;

function shiftDays(iso: string, days: number) {
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysFromToday(iso: string) {
  const target = Date.parse(iso + 'T00:00:00Z');
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((target - today) / DAY_MS);
}

function severityFor(days: number) {
  if (days < 0) return 'overdue';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'urgent';
  if (days <= 90) return 'important';
  return 'normal';
}

function labelFor(type: SupportedDocumentType) {
  return type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

@Injectable()
export class ProtectionService {
  protect(
    documentType: SupportedDocumentType,
    expiryDate: string,
    leadDays: number,
    idempotencyKey?: string,
  ) {
    const protectionId = idempotencyKey
      ? 'prot_' + createHash('sha256')
          .update(['lifeos','expiry',documentType,expiryDate,String(leadDays),idempotencyKey].join(':'))
          .digest('hex')
          .slice(0, 24)
      : 'prot_' + randomUUID().replaceAll('-', '');

    const recommendedActionAt = shiftDays(expiryDate, -leadDays);
    const daysRemaining = daysFromToday(expiryDate);
    const expired = daysRemaining < 0;
    const label = labelFor(documentType);

    return {
      protectionId,
      document: {
        type: documentType,
        label,
        facts: [{
          key: 'expiry_date',
          originalValue: expiryDate,
          value: expiryDate,
          confidence: 1,
          origin: 'user_confirmed',
          trustClass: 'USER_CONFIRMED',
          reviewRequired: false,
          provenance: { source: 'request_body', field: 'expiryDate' },
        }],
      },
      obligation: {
        type: 'EXPIRY_PROTECTION',
        status: expired ? 'action_due' : 'protected',
        confidence: 1,
        rule: {
          code: 'generic_expiry_protection_v1',
          deterministic: true,
          jurisdictional: false,
          legalRuleApplied: false,
          preparationLeadDays: leadDays,
        },
      },
      deadline: {
        dueAt: expiryDate,
        recommendedActionAt,
        daysRemaining,
        severity: severityFor(daysRemaining),
        status: expired ? 'overdue' : 'protected',
        source: 'document.expiry_date',
      },
      task: {
        title: expired ? 'Review expired ' + label.toLowerCase() : 'Prepare ' + label.toLowerCase(),
        status: expired ? 'action_due' : 'ready',
        dueAt: recommendedActionAt,
        approvalRequired: false,
      },
      evidence: {
        sourceTraceability: true,
        deadlineBasis: 'user_confirmed_expiry_date',
        authoritativeDeadlineComputedByRule: true,
        legalRuleApplied: false,
        aiExtractionPerformed: false,
      },
    };
  }
}
