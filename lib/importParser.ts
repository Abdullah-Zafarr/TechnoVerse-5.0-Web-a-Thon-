import Papa from "papaparse";
import type { Difficulty, QuestionOption, QuestionType } from "./types";

export interface ValidatedQuestionRow {
  title: string;
  prompt: string;
  type: QuestionType;
  topic: string;
  difficulty: Difficulty;
  marks: number;
  partialCredit: boolean;
  options: QuestionOption[];
  correctOptionIds: string[];
  rubric: string | null;
}

export interface ValidatedCandidateRow {
  rowNum: number;
  name: string;
  email: string;
}

type RawRecord = Record<string, unknown>;

function asTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeJsonRecord(item: unknown): RawRecord | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }
  const out: RawRecord = {};
  for (const [k, v] of Object.entries(item)) {
    out[k.trim().toLowerCase()] = v;
  }
  return out;
}

function unwrapJsonArray(
  parsed: unknown,
  kind: "questions" | "candidates"
): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const candidateKeys = [kind, "items", "data", "records"];
    for (const key of candidateKeys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as unknown[];
      }
    }
  }
  return null;
}

/**
 * Parse CSV or JSON import text into normalized records and collect syntax errors.
 */
export function parseImportRows(
  format: "csv" | "json",
  content: string,
  kind: "questions" | "candidates"
):
  | {
      ok: true;
      rows: Array<RawRecord | null>;
      badRowIndices: Set<number>;
      errors: string[];
    }
  | { ok: false; error: string; status: number; errors: string[] } {
  const cleaned = content.replace(/^\uFEFF/, "").trim();
  const errors: string[] = [];
  const badRowIndices = new Set<number>();

  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: "Invalid JSON syntax",
        status: 400,
        errors,
      };
    }

    const list = unwrapJsonArray(parsed, kind);
    if (!list) {
      return {
        ok: false,
        error: "JSON payload must be an array of records",
        status: 400,
        errors,
      };
    }

    const rows = list.map(normalizeJsonRecord);
    if (rows.length === 0) {
      return {
        ok: false,
        error: "No data rows found in import input",
        status: 400,
        errors,
      };
    }
    return { ok: true, rows, badRowIndices, errors };
  }

  const csv = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim().toLowerCase(),
  });

  for (const err of csv.errors) {
    if (err.code === "TooFewFields") {
      // Allow omitted trailing optional columns; required fields are validated per row.
      continue;
    }
    if (typeof err.row === "number") {
      badRowIndices.add(err.row);
    }
    errors.push(`CSV line ${(err.row ?? 0) + 1}: ${err.message}`);
  }

  if (csv.data.length === 0) {
    return {
      ok: false,
      error: "No data rows found in import input",
      status: 400,
      errors,
    };
  }

  return { ok: true, rows: csv.data, badRowIndices, errors };
}

function parseOptionsField(raw: unknown): QuestionOption[] {
  if (Array.isArray(raw)) {
    const out: QuestionOption[] = [];
    for (let i = 0; i < raw.length; i++) {
      const entry = raw[i];
      if (typeof entry === "object" && entry !== null) {
        const obj = entry as Record<string, unknown>;
        const text = asTrimmedString(obj.text ?? obj.label ?? obj.value);
        if (!text) continue;
        const id = asTrimmedString(obj.id) || `o${out.length + 1}`;
        out.push({ id, text });
      } else {
        const text = asTrimmedString(entry);
        if (!text) continue;
        out.push({ id: `o${out.length + 1}`, text });
      }
    }
    return out;
  }

  return asTrimmedString(raw)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: `o${idx + 1}`, text }));
}

function parseCorrectTokens(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => asTrimmedString(v)).filter(Boolean);
  }
  if (typeof raw === "number") {
    return [String(raw)];
  }
  return asTrimmedString(raw)
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePartialCredit(raw: unknown, type: QuestionType): boolean {
  if (type !== "multi_select") return false;
  if (typeof raw === "boolean") return raw;
  const s = asTrimmedString(raw).toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  return true;
}

/**
 * Validate normalized import rows into question payloads ready for persistence.
 */
export function validateQuestionRows(
  rows: Array<RawRecord | null>,
  badRowIndices: Set<number>
): { validQuestions: ValidatedQuestionRow[]; errors: string[] } {
  const validQuestions: ValidatedQuestionRow[] = [];
  const errors: string[] = [];

  for (let index = 0; index < rows.length; index++) {
    if (badRowIndices.has(index)) continue;

    const row = rows[index];
    const rowNum = index + 1;
    if (!row) {
      errors.push(`Row ${rowNum}: record must be a JSON object`);
      continue;
    }

    const title = asTrimmedString(row.title);
    const prompt = asTrimmedString(row.prompt ?? row.question);
    const type = (asTrimmedString(row.type).toLowerCase() ||
      "single_mcq") as QuestionType;
    const topic = asTrimmedString(row.topic) || "Imported";
    const difficulty = (asTrimmedString(row.difficulty).toLowerCase() ||
      "medium") as Difficulty;
    const rawMarks = asTrimmedString(row.marks);
    const marks = rawMarks === "" ? 2 : Number(rawMarks);
    const rubric = asTrimmedString(row.rubric);

    if (!title || !prompt) {
      errors.push(`Row ${rowNum}: missing title or prompt`);
      continue;
    }
    if (!["single_mcq", "multi_select", "written"].includes(type)) {
      errors.push(`Row ${rowNum}: invalid type '${type}'`);
      continue;
    }
    if (!["easy", "medium", "hard"].includes(difficulty)) {
      errors.push(`Row ${rowNum}: invalid difficulty '${difficulty}'`);
      continue;
    }
    if (!Number.isFinite(marks) || marks <= 0 || marks > 100) {
      errors.push(`Row ${rowNum}: marks must be between 1 and 100`);
      continue;
    }

    const options = parseOptionsField(row.options);
    const rawCorrect = parseCorrectTokens(
      row.correct ?? row.correctoptionids ?? row.correct_option_ids
    );

    if (
      type !== "written" &&
      (options.length < 2 || rawCorrect.length === 0)
    ) {
      errors.push(
        `Row ${rowNum}: objective questions need pipe-separated options and correct 1-based indices`
      );
      continue;
    }

    if (type === "single_mcq" && rawCorrect.length !== 1) {
      errors.push(
        `Row ${rowNum}: single_mcq requires exactly 1 valid correct index`
      );
      continue;
    }

    const optionIds = new Set(options.map((o) => o.id));
    if (type !== "written" && optionIds.size !== options.length) {
      errors.push(`Row ${rowNum}: duplicate option IDs`);
      continue;
    }

    const mappedCorrect: string[] = [];
    let hasInvalidIndex = false;

    if (type !== "written") {
      for (const token of rawCorrect) {
        const numeric = Number(token);
        if (token !== "" && Number.isFinite(numeric)) {
          if (
            !Number.isInteger(numeric) ||
            numeric < 1 ||
            numeric > options.length
          ) {
            hasInvalidIndex = true;
            break;
          }
          mappedCorrect.push(options[numeric - 1].id);
        } else if (optionIds.has(token)) {
          mappedCorrect.push(token);
        } else {
          hasInvalidIndex = true;
          break;
        }
      }
    }

    if (hasInvalidIndex) {
      errors.push(`Row ${rowNum}: correct option index out of range`);
      continue;
    }

    const correctOptionIds = Array.from(new Set(mappedCorrect));
    if (type !== "written" && correctOptionIds.length !== rawCorrect.length) {
      errors.push(`Row ${rowNum}: duplicate correct option index`);
      continue;
    }

    validQuestions.push({
      title,
      prompt,
      type,
      topic,
      difficulty,
      marks,
      partialCredit: parsePartialCredit(
        row.partialcredit ?? row.partial_credit,
        type
      ),
      options: type === "written" ? [] : options,
      correctOptionIds: type === "written" ? [] : correctOptionIds,
      rubric: type === "written" ? rubric || null : null,
    });
  }

  return { validQuestions, errors };
}

/**
 * Validate normalized import rows into candidate name/email records.
 */
export function validateCandidateRows(
  rows: Array<RawRecord | null>,
  badRowIndices: Set<number>
): { validCandidates: ValidatedCandidateRow[]; errors: string[] } {
  const validCandidates: ValidatedCandidateRow[] = [];
  const errors: string[] = [];

  for (let index = 0; index < rows.length; index++) {
    if (badRowIndices.has(index)) continue;

    const row = rows[index];
    const rowNum = index + 1;
    if (!row) {
      errors.push(`Row ${rowNum}: record must be a JSON object`);
      continue;
    }

    const name = asTrimmedString(
      row.name ??
        row.fullname ??
        row.full_name ??
        row.candidatename ??
        row.candidate_name
    );
    const email = asTrimmedString(
      row.email ?? row.emailaddress ?? row.email_address
    ).toLowerCase();

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${rowNum}: valid name and email required`);
      continue;
    }

    validCandidates.push({ rowNum, name, email });
  }

  return { validCandidates, errors };
}
