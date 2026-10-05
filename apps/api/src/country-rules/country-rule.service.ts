import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { EvaluateCountryRuleDto } from './country-rule.dto.js';

interface RuleRow {
  rule_code: string;
  version: number;
  title: string;
  document_type: string;
  rule_type: string;
  rule_json: unknown;
  automatic_deadline: boolean;
  effective_from: string | null;
  effective_to: string | null;
  activated_at: string | null;
  source_code: string;
  authority: string;
  source_title: string;
  legal_reference: string | null;
  source_type: string;
  source_url: string;
  language: string;
  evidence_locator: unknown;
  verified_on: string;
}

@Injectable()
export class CountryRuleService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async getPack(jurisdictionInput: string) {
    const jurisdiction = normalizeJurisdiction(jurisdictionInput);
    const result = await this.database.queryPublic<RuleRow>(`
      select
        r.rule_code,
        r.version,
        r.title,
        r.document_type,
        r.rule_type,
        r.rule_json,
        r.automatic_deadline,
        r.effective_from::text,
        r.effective_to::text,
        r.activated_at::text,
        s.source_code,
        s.authority,
        s.title as source_title,
        s.legal_reference,
        s.source_type,
        s.source_url,
        s.language,
        s.evidence_locator,
        s.verified_on::text
      from public.country_rule_versions r
      join public.official_sources s on s.id=r.source_id
      where r.jurisdiction=$1
        and r.status='active'
        and s.status='active'
        and (r.effective_from is null or r.effective_from <= current_date)
        and (r.effective_to is null or r.effective_to >= current_date)
      order by r.document_type,r.rule_type,r.rule_code,r.version
    `, [jurisdiction]);

    if (!result.rows.length) {
      throw new NotFoundException({
        code: 'COUNTRY_PACK_NOT_FOUND',
        message: `No active country pack is available for ${jurisdiction}.`,
      });
    }

    const sources = new Map<string, ReturnType<typeof mapSource>>();
    const rules = result.rows.map((row) => {
      sources.set(row.source_code, mapSource(row));
      return mapRule(row);
    });

    return {
      jurisdiction,
      status: 'pilot',
      trustPolicy: {
        activeRulesRequirePrimarySource: true,
        automaticDeadlineDefault: false,
        actualExpiryDeadlinesUseDocumentFact: true,
      },
      rules,
      sources: [...sources.values()],
    };
  }

  async evaluate(jurisdictionInput: string, input: EvaluateCountryRuleDto) {
    const jurisdiction = normalizeJurisdiction(jurisdictionInput);
    const result = await this.database.queryPublic<RuleRow>(`
      select
        r.rule_code,
        r.version,
        r.title,
        r.document_type,
        r.rule_type,
        r.rule_json,
        r.automatic_deadline,
        r.effective_from::text,
        r.effective_to::text,
        r.activated_at::text,
        s.source_code,
        s.authority,
        s.title as source_title,
        s.legal_reference,
        s.source_type,
        s.source_url,
        s.language,
        s.evidence_locator,
        s.verified_on::text
      from public.country_rule_versions r
      join public.official_sources s on s.id=r.source_id
      where r.jurisdiction=$1
        and r.rule_code=$2
        and r.status='active'
        and s.status='active'
        and (r.effective_from is null or r.effective_from <= current_date)
        and (r.effective_to is null or r.effective_to >= current_date)
      order by r.version desc
      limit 1
    `, [jurisdiction, input.ruleCode]);

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'COUNTRY_RULE_NOT_FOUND',
        message: `Active rule ${input.ruleCode} was not found for ${jurisdiction}.`,
      });
    }

    if (row.rule_type !== 'application_requirement') {
      throw new UnprocessableEntityException({
        code: 'COUNTRY_RULE_NOT_EVALUATABLE',
        message: 'This rule is informational and is not an application-requirement evaluator.',
      });
    }

    const definition = asObject(row.rule_json);
    const appliesWhen = asObject(definition.appliesWhen);
    const minimumAge = numberOrNull(appliesWhen.ageYearsGte);
    const applies = minimumAge === null || input.ageYears >= minimumAge;

    const requirements = Array.isArray(definition.requires)
      ? definition.requires.map(asObject)
      : [];

    const missingRequirements = applies
      ? requirements.filter((requirement) => {
          const documentType = stringOrNull(requirement.documentType);
          const requiredState = stringOrNull(requirement.state);
          if (!documentType || !requiredState) return true;
          return !input.documents.some(
            (document) => document.type === documentType && document.state === requiredState,
          );
        }).map((requirement) => ({
          documentType: stringOrNull(requirement.documentType),
          requiredState: stringOrNull(requirement.state),
        }))
      : [];

    return {
      jurisdiction,
      rule: mapRule(row),
      context: {
        ageYears: input.ageYears,
        documents: input.documents,
      },
      result: {
        applies,
        satisfied: !applies || missingRequirements.length === 0,
        missingRequirements,
        automaticTask: false,
        automaticDeadline: false,
      },
      evidence: mapSource(row),
    };
  }
}

function normalizeJurisdiction(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new NotFoundException({
      code: 'COUNTRY_PACK_NOT_FOUND',
      message: 'Jurisdiction must be an ISO 3166-1 alpha-2 code.',
    });
  }
  return normalized;
}

function mapRule(row: RuleRow) {
  return {
    code: row.rule_code,
    version: row.version,
    title: row.title,
    documentType: row.document_type,
    type: row.rule_type,
    definition: row.rule_json,
    automaticDeadline: row.automatic_deadline,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    activatedAt: row.activated_at,
    sourceCode: row.source_code,
  };
}

function mapSource(row: RuleRow) {
  return {
    code: row.source_code,
    authority: row.authority,
    title: row.source_title,
    legalReference: row.legal_reference,
    type: row.source_type,
    url: row.source_url,
    language: row.language,
    evidenceLocator: row.evidence_locator,
    verifiedOn: row.verified_on,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.length ? value : null;
}
