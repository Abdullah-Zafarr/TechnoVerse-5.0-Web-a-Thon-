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

function normalizeHeaderKey(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeJsonRecord(item: unknown): RawRecord | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }
  const out: RawRecord = {};
  for (const [k, v] of Object.entries(item)) {
    const key = normalizeHeaderKey(k);
    if (key) out[key] = v;
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
    const candidateKeys = [
      kind,
      "items",
      "data",
      "records",
      "rows",
      "results",
      "list",
      "entries",
      "users",
      "students",
      "question_bank",
      "bank",
    ];
    for (const key of candidateKeys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as unknown[];
      }
    }

    // Check if the object itself is a single record before scanning arbitrary array fields
    // (a single question record has `options` / `correctOptionIds` arrays).
    const normalizedKeys = new Set(Object.keys(obj).map(normalizeHeaderKey));
    const singleRecordHints =
      kind === "questions"
        ? ["title", "prompt", "question", "question_text", "text", "statement", "body"]
        : ["name", "full_name", "candidate_name", "email", "mail", "email_address"];
    if (singleRecordHints.some((hint) => normalizedKeys.has(hint))) {
      return [obj];
    }

    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        return val;
      }
    }

    if (Object.keys(obj).length > 0) {
      return [obj];
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
      const lines = cleaned
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length > 0) {
        try {
          parsed = lines.map((line) => JSON.parse(line));
        } catch {
          return {
            ok: false,
            error: "Invalid JSON syntax",
            status: 400,
            errors,
          };
        }
      } else {
        return {
          ok: false,
          error: "Invalid JSON syntax",
          status: 400,
          errors,
        };
      }
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
    transformHeader: (h) => normalizeHeaderKey(h),
  });

  for (const err of csv.errors) {
    if (err.code === "TooFewFields" || err.code === "UndetectableDelimiter") {
      // Allow omitted trailing optional columns or single-column/default-comma inputs.
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

function parseOptionsField(raw: unknown, row?: RawRecord): QuestionOption[] {
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

  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw as Record<string, unknown>)
      .map(([k, v], idx) => ({
        id: asTrimmedString(k) || `o${idx + 1}`,
        text: asTrimmedString(v),
      }))
      .filter((o) => o.text.length > 0);
  }

  const rawStr = asTrimmedString(raw);
  if (
    (rawStr.startsWith("[") && rawStr.endsWith("]")) ||
    (rawStr.startsWith("{") && rawStr.endsWith("}"))
  ) {
    try {
      const parsedJson = JSON.parse(rawStr);
      if (parsedJson && typeof parsedJson === "object") {
        return parseOptionsField(parsedJson, row);
      }
    } catch {
      // Fall through to pipe-delimited parsing.
    }
  }

  const pipeOptions = rawStr
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: `o${idx + 1}`, text }));

  if (pipeOptions.length > 0 || !row) {
    return pipeOptions;
  }

  const columnGroups = [
    ["option1", "option_1", "optiona", "option_a", "choice1", "choice_1", "choicea", "choice_a", "opt1", "opt_1", "opta", "opt_a", "ans1", "ans_1", "a"],
    ["option2", "option_2", "optionb", "option_b", "choice2", "choice_2", "choiceb", "choice_b", "opt2", "opt_2", "optb", "opt_b", "ans2", "ans_2", "b"],
    ["option3", "option_3", "optionc", "option_c", "choice3", "choice_3", "choicec", "choice_c", "opt3", "opt_3", "optc", "opt_c", "ans3", "ans_3", "c"],
    ["option4", "option_4", "optiond", "option_d", "choice4", "choice_4", "choiced", "choice_d", "opt4", "opt_4", "optd", "opt_d", "ans4", "ans_4", "d"],
    ["option5", "option_5", "optione", "option_e", "choice5", "choice_5", "choicee", "choice_e", "opt5", "opt_5", "opte", "opt_e", "ans5", "ans_5", "e"],
  ];
  const fromColumns: QuestionOption[] = [];
  for (const aliases of columnGroups) {
    for (const key of aliases) {
      const text = asTrimmedString(row[key]);
      if (text) {
        fromColumns.push({ id: `o${fromColumns.length + 1}`, text });
        break;
      }
    }
  }
  return fromColumns;
}

function normalizeQuestionType(raw: unknown): string {
  const value = asTrimmedString(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (!value) return "single_mcq";
  if (
    [
      "mcq",
      "single",
      "single_choice",
      "single_mcq",
      "multiple_choice",
      "mcq_single",
      "true_false",
      "true/false",
      "tf",
    ].includes(value)
  ) {
    return "single_mcq";
  }
  if (
    [
      "multi",
      "multiple",
      "multiple_select",
      "multi_select",
      "multi_mcq",
      "checkbox",
      "checkboxes",
    ].includes(value)
  ) {
    return "multi_select";
  }
  if (
    [
      "essay",
      "short_answer",
      "long_answer",
      "free_text",
      "descriptive",
      "open",
      "subjective",
      "text",
    ].includes(value)
  ) {
    return "written";
  }
  return value;
}

function normalizeDifficulty(raw: unknown): string {
  const value = asTrimmedString(raw).toLowerCase();
  if (!value) return "medium";
  if (["easy", "low", "beginner", "basic", "1"].includes(value)) return "easy";
  if (["medium", "moderate", "normal", "intermediate", "2"].includes(value)) {
    return "medium";
  }
  if (["hard", "high", "advanced", "difficult", "3"].includes(value)) {
    return "hard";
  }
  return value;
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

  const firstObj = rows.find((r): r is RawRecord => r !== null);
  if (firstObj) {
    const keys = Object.keys(firstObj);
    const hasEmailCol = keys.some((k) =>
      ["email", "emailaddress", "email_address", "mail"].includes(k)
    );
    const hasQuestionCol = keys.some((k) =>
      [
        "prompt",
        "question",
        "question_text",
        "questiontext",
        "question_prompt",
        "question_body",
        "question_stem",
        "stem",
        "text",
        "statement",
        "problem",
        "problem_statement",
        "description",
        "body",
        "content",
        "query",
        "q",
        "q_text",
        "mcq",
        "item",
        "title",
        "question_title",
        "options",
        "choices",
        "option1",
        "option_1",
        "optiona",
        "option_a",
      ].includes(k)
    );
    if (hasEmailCol && !hasQuestionCol) {
      errors.push(
        `Detected candidate columns (${keys.join(", ")}). Switch Import Target to "Candidates" and retry.`
      );
      return { validQuestions, errors };
    }
  }

  for (let index = 0; index < rows.length; index++) {
    if (badRowIndices.has(index)) continue;

    const row = rows[index];
    const rowNum = index + 1;
    if (!row) {
      errors.push(`Row ${rowNum}: record must be a JSON object`);
      continue;
    }

    const explicitTitle = asTrimmedString(
      row.title ?? row.question_title ?? row.heading
    );
    const rawPrompt = asTrimmedString(
      row.prompt ??
        row.question ??
        row.question_text ??
        row.questiontext ??
        row.question_prompt ??
        row.question_body ??
        row.question_stem ??
        row.stem ??
        row.text ??
        row.statement ??
        row.problem ??
        row.problem_statement ??
        row.description ??
        row.body ??
        row.content ??
        row.query ??
        row.q ??
        row.q_text ??
        row.mcq ??
        row.item
    );
    const prompt = rawPrompt || explicitTitle;
    const rawTitle = explicitTitle || asTrimmedString(row.name ?? row.code);
    const title = rawTitle || (prompt ? prompt.slice(0, 60).trim() : "");
    const type = normalizeQuestionType(
      row.type ?? row.question_type ?? row.questiontype ?? row.kind
    ) as QuestionType;
    const topic =
      asTrimmedString(
        row.topic ??
          row.subject ??
          row.category ??
          row.chapter ??
          row.module ??
          row.section ??
          row.course ??
          row.tag
      ) || "Imported";
    const difficulty = normalizeDifficulty(
      row.difficulty ?? row.level ?? row.diff
    ) as Difficulty;
    const rawMarks = asTrimmedString(
      row.marks ?? row.points ?? row.score ?? row.weight ?? row.max_marks
    );
    const marks = rawMarks === "" ? 2 : Number(rawMarks);
    const rubric = asTrimmedString(
      row.rubric ?? row.explanation ?? row.grading_rubric ?? row.marking_scheme
    );

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

    const options = parseOptionsField(
      row.options ?? row.choices ?? row.alternatives,
      row
    );
    const rawCorrect = parseCorrectTokens(
      row.correct ??
        row.correctoptionids ??
        row.correct_option_ids ??
        row.correct_options ??
        row.correct_option ??
        row.correct_answer ??
        row.correct_answers ??
        row.correctanswer ??
        row.answer ??
        row.answer_key ??
        row.correct_choice ??
        row.right_answer ??
        row.solution ??
        row.key ??
        row.ans
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
        const cleanedToken = token
          .replace(/^(?:option|choice|opt)\s+/i, "")
          .replace(/^[([]?([A-Ea-e1-5])[)\].:]?$/, "$1")
          .trim();
        const numeric = Number(cleanedToken);
        const textMatch = options.find(
          (o) => o.text.toLowerCase() === token.toLowerCase()
        );
        if (textMatch) {
          mappedCorrect.push(textMatch.id);
        } else if (
          cleanedToken !== "" &&
          Number.isInteger(numeric) &&
          numeric >= 1 &&
          numeric <= options.length
        ) {
          mappedCorrect.push(options[numeric - 1].id);
        } else if (optionIds.has(token)) {
          mappedCorrect.push(token);
        } else if (/^[A-Ea-e]$/.test(cleanedToken)) {
          const letterIdx = cleanedToken.toUpperCase().charCodeAt(0) - 65;
          if (letterIdx < 0 || letterIdx >= options.length) {
            hasInvalidIndex = true;
            break;
          }
          mappedCorrect.push(options[letterIdx].id);
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

  if (
    validQuestions.length === 0 &&
    errors.length > 0 &&
    errors.every((e) => e.endsWith("missing title or prompt")) &&
    firstObj
  ) {
    const detected = Object.keys(firstObj).filter(Boolean);
    errors.unshift(
      `Detected columns: ${detected.length > 0 ? detected.join(", ") : "(none)"}. Expected a question/prompt column (e.g. prompt, question, question_text, or title).`
    );
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
