import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  real,
  index,
  uniqueIndex,
  customType,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ AUTH */

export const users = pgTable(
  "users",
  {
    userId: id(),
    novaId: text("nova_id").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("student"), // student | admin | owner
    status: text("status").notNull().default("active"), // active | blocked
    avatarSeed: text("avatar_seed").notNull().default("nova"),
    bio: text("bio").notNull().default(""),
    onboarded: boolean("onboarded").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("users_nova_id_uq").on(t.novaId),
    uniqueIndex("users_email_uq").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    ip: text("ip").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("prt_token_uq").on(t.tokenHash), index("prt_user_idx").on(t.userId)],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.userId, { onDelete: "cascade" }),
  schoolLevel: text("school_level").notNull().default("junior"), // junior | senior
  grade: integer("grade").notNull().default(1),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(45),
  favoriteSubjects: jsonb("favorite_subjects").$type<string[]>().notNull().default([]),
  englishLevel: text("english_level").notNull().default("A2"),
  dailyWordCount: integer("daily_word_count").notNull().default(10),
  reminderTime: text("reminder_time").notNull().default("20:00"),
  aiReminderFrequency: text("ai_reminder_frequency").notNull().default("normal"),
  theme: text("theme").notNull().default("dark"),
  reducedMotion: boolean("reduced_motion").notNull().default(false),
  updatedAt: updated(),
});

/* --------------------------------------------------------------- GRADES */

export const grades = pgTable(
  "grades",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    targetScore: real("target_score"),
    baselineScore: real("baseline_score"),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("grades_user_subject_uq").on(t.userId, t.subject)],
);

export const gradeRecords = pgTable(
  "grade_records",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    examName: text("exam_name").notNull(),
    examType: text("exam_type").notNull().default("quiz"), // midterm | quiz | mock | homework | daily
    examDate: text("exam_date").notNull(),
    fullScore: real("full_score").notNull().default(100),
    score: real("score").notNull(),
    percentage: real("percentage").notNull(),
    scope: text("scope").notNull().default(""),
    classAverage: real("class_average"),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("gr_user_subject_idx").on(t.userId, t.subject), index("gr_user_date_idx").on(t.userId, t.examDate)],
);

export const exams = pgTable(
  "exams",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    examDate: text("exam_date").notNull(),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("exams_user_idx").on(t.userId, t.examDate)],
);

export const examSubjects = pgTable(
  "exam_subjects",
  {
    id: id(),
    examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    scope: text("scope").notNull().default(""),
    targetScore: real("target_score"),
  },
  (t) => [index("exam_subjects_exam_idx").on(t.examId)],
);

/* -------------------------------------------------------------- STORAGE */

export const storageObjects = pgTable(
  "storage_objects",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.userId, { onDelete: "cascade" }),
    driver: text("driver").notNull().default("db"), // db | s3
    storageKey: text("storage_key").notNull(),
    bucket: text("bucket").notNull().default(""),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    filename: text("filename").notNull(),
    visibility: text("visibility").notNull().default("private"),
    data: bytea("data"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("storage_key_uq").on(t.storageKey), index("storage_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------ MATERIALS */

export const studyMaterials = pgTable(
  "study_materials",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull().default("其他"),
    kind: text("kind").notNull().default("text"), // pdf | txt | image | text
    status: text("status").notNull().default("ready"), // uploading | processing | analyzing | ready | failed
    visibility: text("visibility").notNull().default("private"), // private | friends | group | link | public
    shareSlug: text("share_slug"),
    content: text("content").notNull().default(""),
    summary: text("summary").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    errorMessage: text("error_message").notNull().default(""),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("materials_user_idx").on(t.userId), uniqueIndex("materials_slug_uq").on(t.shareSlug)],
);

export const studyMaterialPages = pgTable(
  "study_material_pages",
  {
    id: id(),
    materialId: uuid("material_id").notNull().references(() => studyMaterials.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    text: text("text").notNull().default(""),
    objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "set null" }),
  },
  (t) => [index("mat_pages_idx").on(t.materialId, t.pageNumber)],
);

export const ocrDocuments = pgTable(
  "ocr_documents",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull().default("未命名辨識"),
    subject: text("subject").notNull().default("其他"),
    status: text("status").notNull().default("pending"), // pending | processing | completed | failed
    combinedText: text("combined_text").notNull().default(""),
    aiResult: jsonb("ai_result").$type<Record<string, unknown> | null>(),
    errorMessage: text("error_message").notNull().default(""),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ocr_docs_user_idx").on(t.userId)],
);

export const ocrPages = pgTable(
  "ocr_pages",
  {
    id: id(),
    documentId: uuid("document_id").notNull().references(() => ocrDocuments.id, { onDelete: "cascade" }),
    objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "set null" }),
    orderIndex: integer("order_index").notNull().default(0),
    rotation: integer("rotation").notNull().default(0),
    crop: jsonb("crop").$type<{ x: number; y: number; w: number; h: number } | null>(),
    highlights: jsonb("highlights").$type<Array<{ color: string; x: number; y: number; w: number; h: number }>>().notNull().default([]),
    text: text("text").notNull().default(""),
    blocks: jsonb("blocks").$type<Array<{ content: string; x: number; y: number; width: number; height: number; confidence: number; page: number; line: number; block: number }>>().notNull().default([]),
    confidence: real("confidence").notNull().default(0),
    status: text("status").notNull().default("pending"),
  },
  (t) => [index("ocr_pages_doc_idx").on(t.documentId, t.orderIndex)],
);

export const notes = pgTable(
  "notes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull().default("其他"),
    body: text("body").notNull().default(""),
    source: text("source").notNull().default("manual"),
    materialId: uuid("material_id").references(() => studyMaterials.id, { onDelete: "set null" }),
    visibility: text("visibility").notNull().default("private"),
    shareSlug: text("share_slug"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("notes_user_idx").on(t.userId), uniqueIndex("notes_slug_uq").on(t.shareSlug)],
);

/* --------------------------------------------------------------- QUIZ */

export const questions = pgTable(
  "questions",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => users.userId, { onDelete: "cascade" }),
    origin: text("origin").notNull().default("ai"), // ai | bank | admin | user
    subject: text("subject").notNull(),
    topic: text("topic").notNull().default(""),
    level: text("level").notNull().default("junior"),
    difficulty: text("difficulty").notNull().default("normal"),
    type: text("type").notNull().default("single"), // single | multiple | fill | truefalse | short | reading
    stem: text("stem").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    answer: jsonb("answer").$type<string[]>().notNull().default([]),
    explanation: text("explanation").notNull().default(""),
    fingerprint: text("fingerprint").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("questions_fingerprint_uq").on(t.fingerprint),
    index("questions_subject_idx").on(t.subject, t.difficulty),
  ],
);

export const quizzes = pgTable(
  "quizzes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull().default("其他"),
    difficulty: text("difficulty").notNull().default("normal"),
    source: text("source").notNull().default("ai"),
    materialId: uuid("material_id").references(() => studyMaterials.id, { onDelete: "set null" }),
    weekId: uuid("week_id"),
    timeLimitSec: integer("time_limit_sec").notNull().default(600),
    questionIds: jsonb("question_ids").$type<string[]>().notNull().default([]),
    visibility: text("visibility").notNull().default("private"),
    shareSlug: text("share_slug"),
    createdAt: created(),
  },
  (t) => [index("quizzes_user_idx").on(t.userId), uniqueIndex("quizzes_slug_uq").on(t.shareSlug)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: id(),
    quizId: uuid("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"), // in_progress | submitted | abandoned
    score: real("score").notNull().default(0),
    total: integer("total").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    durationSec: integer("duration_sec").notNull().default(0),
    startedAt: created(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    rewardGranted: boolean("reward_granted").notNull().default(false),
  },
  (t) => [index("attempts_user_idx").on(t.userId), index("attempts_quiz_idx").on(t.quizId)],
);

export const answers = pgTable(
  "answers",
  {
    id: id(),
    attemptId: uuid("attempt_id").notNull().references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    response: jsonb("response").$type<string[]>().notNull().default([]),
    isCorrect: boolean("is_correct").notNull().default(false),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("answers_attempt_question_uq").on(t.attemptId, t.questionId)],
);

export const wrongQuestions = pgTable(
  "wrong_questions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default("其他"),
    wrongCount: integer("wrong_count").notNull().default(1),
    reviewCount: integer("review_count").notNull().default(0),
    mastery: integer("mastery").notNull().default(0),
    reason: text("reason").notNull().default(""),
    aiTip: text("ai_tip").notNull().default(""),
    lastWrongAt: created(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("wq_user_question_uq").on(t.userId, t.questionId), index("wq_user_next_idx").on(t.userId, t.nextReviewAt)],
);

export const userVocabularies = pgTable(
  "user_vocabularies",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    word: text("word").notNull(),
    normalizedWord: text("normalized_word").notNull(),
    partOfSpeech: text("part_of_speech").notNull().default(""),
    meaning: text("meaning").notNull().default(""),
    phonetic: text("phonetic").notNull().default(""),
    example: text("example").notNull().default(""),
    exampleZh: text("example_zh").notNull().default(""),
    analysis: jsonb("analysis").$type<Record<string, unknown>>().notNull().default({}),
    sourceDocumentId: uuid("source_document_id").references(() => ocrDocuments.id, { onDelete: "set null" }),
    sourceObjectId: uuid("source_object_id").references(() => storageObjects.id, { onDelete: "set null" }),
    familiarity: integer("familiarity").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("user_vocabularies_word_uq").on(t.userId, t.normalizedWord), index("user_vocabularies_user_idx").on(t.userId, t.updatedAt)],
);

/* -------------------------------------------------------- PLAN / STUDY */

export const studyPlans = pgTable(
  "study_plans",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    planDate: text("plan_date").notNull(),
    totalMinutes: integer("total_minutes").notNull().default(0),
    blocks: jsonb("blocks").$type<Array<{ subject: string; minutes: number; focus: string; done: boolean }>>().notNull().default([]),
    rationale: text("rationale").notNull().default(""),
    generatedBy: text("generated_by").notNull().default("ai"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("plan_user_date_uq").on(t.userId, t.planDate)],
);

export const studyRecords = pgTable(
  "study_records",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    subject: text("subject").notNull().default("其他"),
    minutes: integer("minutes").notNull().default(0),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    recordDate: text("record_date").notNull(),
    createdAt: created(),
  },
  (t) => [index("study_records_user_date_idx").on(t.userId, t.recordDate)],
);

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull().default("其他"),
    dueDate: text("due_date").notNull(),
    done: boolean("done").notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("assignments_user_idx").on(t.userId, t.dueDate)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    source: text("source").notNull().default("manual"),
    dueDate: text("due_date"),
    done: boolean("done").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("tasks_user_idx").on(t.userId)],
);

export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    subject: text("subject").notNull().default("其他"),
    minutes: integer("minutes").notNull(),
    reflection: text("reflection").notNull().default(""),
    roomId: uuid("room_id"),
    completedAt: created(),
  },
  (t) => [index("focus_user_idx").on(t.userId)],
);

/* ---------------------------------------------------------- VOCAB/VOICE */

export const dailyWords = pgTable(
  "daily_words",
  {
    id: id(),
    word: text("word").notNull(),
    meaning: text("meaning").notNull(),
    partOfSpeech: text("part_of_speech").notNull().default(""),
    example: text("example").notNull().default(""),
    exampleZh: text("example_zh").notNull().default(""),
    level: text("level").notNull().default("A2"),
    weekId: uuid("week_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("daily_words_uq").on(t.word, t.level), index("daily_words_week_idx").on(t.weekId)],
);

export const wordProgress = pgTable(
  "word_progress",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    wordId: uuid("word_id").notNull().references(() => dailyWords.id, { onDelete: "cascade" }),
    familiarity: integer("familiarity").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    memoryTip: text("memory_tip").notNull().default(""),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("word_progress_uq").on(t.userId, t.wordId), index("word_progress_next_idx").on(t.userId, t.nextReviewAt)],
);

export const sentences = pgTable(
  "sentences",
  {
    id: id(),
    en: text("en").notNull(),
    zh: text("zh").notNull(),
    level: text("level").notNull().default("A2"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    weekId: uuid("week_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("sentences_uq").on(t.en), index("sentences_week_idx").on(t.weekId)],
);

export const sentenceProgress = pgTable(
  "sentence_progress",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    sentenceId: uuid("sentence_id").notNull().references(() => sentences.id, { onDelete: "cascade" }),
    familiarity: integer("familiarity").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    memoryTip: text("memory_tip").notNull().default(""),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("sentence_progress_uq").on(t.userId, t.sentenceId)],
);

export const voiceRecords = pgTable(
  "voice_records",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "set null" }),
    mode: text("mode").notNull().default("reading"), // reading | recite | speaking
    subject: text("subject").notNull().default("英文"),
    referenceText: text("reference_text").notNull().default(""),
    durationSec: integer("duration_sec").notNull().default(0),
    status: text("status").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [index("voice_user_idx").on(t.userId)],
);

export const voiceTranscripts = pgTable("voice_transcripts", {
  id: id(),
  recordId: uuid("record_id").notNull().references(() => voiceRecords.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull().default(""),
  provider: text("provider").notNull().default(""),
  createdAt: created(),
});

export const voiceAnalysis = pgTable("voice_analysis", {
  id: id(),
  recordId: uuid("record_id").notNull().references(() => voiceRecords.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0),
  fluency: integer("fluency").notNull().default(0),
  accuracy: integer("accuracy").notNull().default(0),
  completeness: integer("completeness").notNull().default(0),
  pace: integer("pace").notNull().default(0),
  missingWords: jsonb("missing_words").$type<string[]>().notNull().default([]),
  extraWords: jsonb("extra_words").$type<string[]>().notNull().default([]),
  advice: text("advice").notNull().default(""),
  createdAt: created(),
});

/* ------------------------------------------------------------------ AI */

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    title: text("title").notNull().default("新的對話"),
    mode: text("mode").notNull().default("teacher"),
    archived: boolean("archived").notNull().default(false),
    contextMaterialId: uuid("context_material_id").references(() => studyMaterials.id, { onDelete: "set null" }),
    allowContext: jsonb("allow_context").$type<string[]>().notNull().default([]),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ai_conv_user_idx").on(t.userId, t.archived)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    provider: text("provider").notNull().default(""),
    model: text("model").notNull().default(""),
    action: jsonb("action").$type<Record<string, unknown> | null>(),
    actionStatus: text("action_status").notNull().default("none"), // none | pending | applied | rejected
    createdAt: created(),
  },
  (t) => [index("ai_msg_conv_idx").on(t.conversationId)],
);

export const aiMemory = pgTable(
  "ai_memory",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("ai_memory_uq").on(t.userId, t.key)],
);

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.userId, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    feature: text("feature").notNull(),
    success: boolean("success").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    fallbackFrom: text("fallback_from").notNull().default(""),
    failureCategory: text("failure_category").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("ai_logs_provider_idx").on(t.provider, t.createdAt), index("ai_logs_feature_idx").on(t.feature)],
);

export const aiProviderHealth = pgTable("ai_provider_health", {
  provider: text("provider").primaryKey(),
  priority: integer("priority").notNull().default(1),
  model: text("model").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastFailureCategory: text("last_failure_category").notNull().default(""),
  inputRatePerMillion: real("input_rate_per_million").notNull().default(0.1),
  outputRatePerMillion: real("output_rate_per_million").notNull().default(0.4),
  updatedAt: updated(),
});

/* -------------------------------------------------------------- SOCIAL */

export const friends = pgTable(
  "friends",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    friendId: uuid("friend_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("friends_uq").on(t.userId, t.friendId)],
);

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: id(),
    fromUserId: uuid("from_user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("friend_req_uq").on(t.fromUserId, t.toUserId), index("friend_req_to_idx").on(t.toUserId, t.status)],
);

export const friendBlocks = pgTable(
  "friend_blocks",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("friend_block_uq").on(t.userId, t.blockedId)],
);

export const groups = pgTable(
  "groups",
  {
    id: id(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("room"), // room | class
    ownerId: uuid("owner_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    joinCode: text("join_code").notNull(),
    goalMinutes: integer("goal_minutes").notNull().default(120),
    createdAt: created(),
  },
  (t) => [uniqueIndex("groups_code_uq").on(t.joinCode)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const challenges = pgTable(
  "challenges",
  {
    id: id(),
    creatorId: uuid("creator_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("word"), // word | quiz
    title: text("title").notNull(),
    quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("open"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [index("challenge_creator_idx").on(t.creatorId)],
);

export const challengeParticipants = pgTable(
  "challenge_participants",
  {
    id: id(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    durationSec: integer("duration_sec").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rewardGranted: boolean("reward_granted").notNull().default(false),
    createdAt: created(),
  },
  (t) => [uniqueIndex("challenge_part_uq").on(t.challengeId, t.userId)],
);

export const shares = pgTable(
  "shares",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    visibility: text("visibility").notNull().default("link"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: created(),
  },
  (t) => [uniqueIndex("shares_slug_uq").on(t.slug), index("shares_user_idx").on(t.userId)],
);

/* --------------------------------------------------- NOTIFY / ECONOMY */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("system"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    createdAt: created(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.readAt), uniqueIndex("notif_dedupe_uq").on(t.dedupeKey)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint), index("push_user_idx").on(t.userId)],
);

export const novaAccounts = pgTable("nova_accounts", {
  userId: uuid("user_id").primaryKey().references(() => users.userId, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  lifetimeSpent: integer("lifetime_spent").notNull().default(0),
  updatedAt: updated(),
});

export const novaTransactions = pgTable(
  "nova_transactions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("system"),
    actorId: uuid("actor_id").references(() => users.userId, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("nova_tx_idem_uq").on(t.idempotencyKey), index("nova_tx_user_idx").on(t.userId)],
);

export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    totalAfter: integer("total_after").notNull(),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("xp_tx_idem_uq").on(t.idempotencyKey), index("xp_tx_user_idx").on(t.userId)],
);

export const achievements = pgTable(
  "achievements",
  {
    id: id(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull().default("🏅"),
    target: integer("target").notNull().default(1),
    metric: text("metric").notNull(),
    rewardNova: integer("reward_nova").notNull().default(0),
    rewardXp: integer("reward_xp").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("achievements_code_uq").on(t.code)],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id").notNull().references(() => achievements.id, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("user_ach_uq").on(t.userId, t.achievementId)],
);

export const dailyTasks = pgTable(
  "daily_tasks",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    taskDate: text("task_date").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    target: integer("target").notNull().default(1),
    progress: integer("progress").notNull().default(0),
    rewardNova: integer("reward_nova").notNull().default(5),
    rewardXp: integer("reward_xp").notNull().default(10),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("daily_task_uq").on(t.userId, t.taskDate, t.code)],
);

/* ---------------------------------------------------------------- NOVI */

export const assistantLevels = pgTable("assistant_levels", {
  level: integer("level").primaryKey(),
  name: text("name").notNull(),
  requiredXp: integer("required_xp").notNull(),
  upgradeCostNova: integer("upgrade_cost_nova").notNull().default(0),
  ability: text("ability").notNull().default(""),
  aura: text("aura").notNull().default("#38bdf8"),
});

export const assistantProfiles = pgTable("assistant_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.userId, { onDelete: "cascade" }),
  name: text("name").notNull().default("Novi"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  skin: text("skin").notNull().default("core-classic"),
  effect: text("effect").notNull().default("none"),
  voice: text("voice").notNull().default("default"),
  title: text("title").notNull().default(""),
  badge: text("badge").notNull().default(""),
  updatedAt: updated(),
});

export const assistantItems = pgTable(
  "assistant_items",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // skin | core | effect | float | voice | title | badge | pass
    priceNova: integer("price_nova").notNull().default(100),
    description: text("description").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    requiredLevel: integer("required_level").notNull().default(1),
    proOnly: boolean("pro_only").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("assistant_items_code_uq").on(t.code)],
);

export const assistantInventory = pgTable(
  "assistant_inventory",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => assistantItems.id, { onDelete: "cascade" }),
    equipped: boolean("equipped").notNull().default(false),
    acquiredAt: created(),
  },
  (t) => [uniqueIndex("assistant_inv_uq").on(t.userId, t.itemId)],
);

export const assistantTransactions = pgTable("assistant_transactions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => assistantItems.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  costNova: integer("cost_nova").notNull().default(0),
  createdAt: created(),
});

/* ------------------------------------------------------- MEMBERSHIP */

export const memberships = pgTable("memberships", {
  userId: uuid("user_id").primaryKey().references(() => users.userId, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("free"), // free | pro
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  grantedBy: uuid("granted_by").references(() => users.userId, { onDelete: "set null" }),
  updatedAt: updated(),
});

export const membershipHistory = pgTable(
  "membership_history",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    action: text("action").notNull(),
    tier: text("tier").notNull(),
    days: integer("days").notNull().default(0),
    reason: text("reason").notNull().default(""),
    actorId: uuid("actor_id").references(() => users.userId, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("membership_hist_user_idx").on(t.userId)],
);

export const featurePermissions = pgTable(
  "feature_permissions",
  {
    id: id(),
    feature: text("feature").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    proOnly: boolean("pro_only").notNull().default(false),
    freeDailyLimit: integer("free_daily_limit").notNull().default(0),
    proDailyLimit: integer("pro_daily_limit").notNull().default(0),
    monthlyLimit: integer("monthly_limit").notNull().default(0),
    novaCost: integer("nova_cost").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("feature_perm_uq").on(t.feature)],
);

export const featureUsage = pgTable(
  "feature_usage",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    usageDate: text("usage_date").notNull(),
    count: integer("count").notNull().default(0),
    unlimited: boolean("unlimited").notNull().default(false),
  },
  (t) => [uniqueIndex("feature_usage_uq").on(t.userId, t.feature, t.usageDate)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    code: text("code").notNull(),
    kind: text("kind").notNull().default("nova"), // nova | pro | xp
    value: integer("value").notNull().default(0),
    maxRedemptions: integer("max_redemptions").notNull().default(1),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.userId, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("coupons_code_uq").on(t.code)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: id(),
    couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("coupon_redeem_uq").on(t.couponId, t.userId)],
);

/* ---------------------------------------------------------- WEEKLY EXAM */

export const weeklyExamWeeks = pgTable(
  "weekly_exam_weeks",
  {
    id: id(),
    weekCode: text("week_code").notNull(), // 2026-W35
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("draft"), // draft | published | archived
    openMode: text("open_mode").notNull().default("schedule"), // schedule | manual_open | manual_close
    openDays: jsonb("open_days").$type<number[]>().notNull().default([6, 0]),
    openTime: text("open_time").notNull().default("08:00"),
    closeTime: text("close_time").notNull().default("23:59"),
    openFrom: timestamp("open_from", { withTimezone: true }),
    openUntil: timestamp("open_until", { withTimezone: true }),
    novaCost: integer("nova_cost").notNull().default(0),
    proOnly: boolean("pro_only").notNull().default(false),
    allowedUserIds: jsonb("allowed_user_ids").$type<string[]>().notNull().default([]),
    allowedGroupIds: jsonb("allowed_group_ids").$type<string[]>().notNull().default([]),
    highlightMap: jsonb("highlight_map").$type<Record<string, string>>().notNull().default({
      yellow: "本次考試",
      green: "重要",
      blue: "句子",
      pink: "單字",
      orange: "注意",
    }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("weeks_code_uq").on(t.weekCode), index("weeks_status_idx").on(t.status)],
);

export const weeklyExamFiles = pgTable(
  "weekly_exam_files",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "set null" }),
    fileKind: text("file_kind").notNull(), // paper | answer | magazine | extra
    orderIndex: integer("order_index").notNull().default(0),
    ocrText: text("ocr_text").notNull().default(""),
    ocrStatus: text("ocr_status").notNull().default("pending"),
    highlights: jsonb("highlights").$type<Array<{ color: string; x: number; y: number; w: number; h: number; note?: string }>>().notNull().default([]),
    createdAt: created(),
  },
  (t) => [index("week_files_idx").on(t.weekId, t.fileKind, t.orderIndex)],
);

export const weeklyExamDrafts = pgTable(
  "weekly_exam_drafts",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    confidence: real("confidence").notNull().default(0),
    status: text("status").notNull().default("draft"), // draft | confirmed | discarded
    createdAt: created(),
  },
  (t) => [index("week_draft_idx").on(t.weekId, t.status)],
);

export const weeklyExamQuestions = pgTable(
  "weekly_exam_questions",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    stem: text("stem").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    answer: jsonb("answer").$type<string[]>().notNull().default([]),
    explanation: text("explanation").notNull().default(""),
    aiConfidence: real("ai_confidence").notNull().default(0),
    needsReview: boolean("needs_review").notNull().default(false),
    published: boolean("published").notNull().default(false),
  },
  (t) => [index("week_q_idx").on(t.weekId, t.orderIndex)],
);

export const weeklyExamAnswers = pgTable(
  "weekly_exam_answers",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    questionNumber: integer("question_number").notNull(),
    answerText: text("answer_text").notNull(),
    matchedQuestionId: uuid("matched_question_id"),
    confidence: real("confidence").notNull().default(0),
  },
  (t) => [
    index("week_ans_idx").on(t.weekId, t.questionNumber),
    foreignKey({
      columns: [t.matchedQuestionId],
      foreignColumns: [weeklyExamQuestions.id],
      name: "week_answers_question_fk",
    }).onDelete("set null"),
  ],
);

export const weeklyExamWords = pgTable(
  "weekly_exam_words",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    word: text("word").notNull(),
    meaning: text("meaning").notNull().default(""),
    example: text("example").notNull().default(""),
    highlightColor: text("highlight_color").notNull().default("pink"),
    published: boolean("published").notNull().default(false),
  },
  (t) => [index("week_words_idx").on(t.weekId)],
);

export const weeklyExamSentences = pgTable(
  "weekly_exam_sentences",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    en: text("en").notNull(),
    zh: text("zh").notNull().default(""),
    highlightColor: text("highlight_color").notNull().default("blue"),
    published: boolean("published").notNull().default(false),
  },
  (t) => [index("week_sent_idx").on(t.weekId)],
);

export const weeklyExamAttempts = pgTable(
  "weekly_exam_attempts",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"),
    responses: jsonb("responses").$type<Record<string, string[]>>().notNull().default({}),
    startedAt: created(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [index("week_attempt_idx").on(t.weekId, t.userId)],
);

export const weeklyExamResults = pgTable(
  "weekly_exam_results",
  {
    id: id(),
    weekId: uuid("week_id").notNull().references(() => weeklyExamWeeks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => weeklyExamAttempts.id, { onDelete: "set null" }),
    score: real("score").notNull().default(0),
    total: integer("total").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    reciteCompleted: boolean("recite_completed").notNull().default(false),
    rewardGranted: boolean("reward_granted").notNull().default(false),
    createdAt: created(),
  },
  (t) => [uniqueIndex("week_result_uq").on(t.weekId, t.userId)],
);

/* --------------------------------------------------- ACTIVITY / ADMIN */

export const activities = pgTable(
  "activities",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    cover: text("cover").notNull().default("🎉"),
    kind: text("kind").notNull().default("weekend_double"),
    goalMetric: text("goal_metric").notNull().default("minutes"),
    goalValue: integer("goal_value").notNull().default(60),
    rewardNova: integer("reward_nova").notNull().default(50),
    rewardXp: integer("reward_xp").notNull().default(100),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    published: boolean("published").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("activities_pub_idx").on(t.published, t.startsAt)],
);

export const activityParticipants = pgTable(
  "activity_participants",
  {
    id: id(),
    activityId: uuid("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("activity_part_uq").on(t.activityId, t.userId)],
);

export const activityRewards = pgTable(
  "activity_rewards",
  {
    id: id(),
    activityId: uuid("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    nova: integer("nova").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    createdAt: created(),
  },
  (t) => [uniqueIndex("activity_reward_uq").on(t.activityId, t.userId)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    image: text("image").notNull().default(""),
    audience: text("audience").notNull().default("all"), // all | pro | users | group
    audienceIds: jsonb("audience_ids").$type<string[]>().notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    marquee: boolean("marquee").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    notify: boolean("notify").notNull().default(true),
    push: boolean("push").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.userId, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("announcements_idx").on(t.pinned, t.startsAt)],
);

export const adminLogs = pgTable(
  "admin_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.userId, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),
    reason: text("reason").notNull().default(""),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    ip: text("ip").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("admin_logs_idx").on(t.createdAt), index("admin_logs_actor_idx").on(t.actorId)],
);

export const systemLogs = pgTable(
  "system_logs",
  {
    id: id(),
    level: text("level").notNull().default("info"),
    scope: text("scope").notNull().default("app"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("system_logs_idx").on(t.createdAt)],
);

export const jobQueue = pgTable(
  "job_queue",
  {
    id: id(),
    name: text("name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"), // pending | running | done | failed
    uniqueKey: text("unique_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("job_unique_uq").on(t.uniqueKey), index("job_status_idx").on(t.status, t.runAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: id(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("rate_limit_uq").on(t.bucket, t.windowStart)],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updated(),
});

/* ------------------------------------------------------ SUPPORT / FAQ */

export const issueReports = pgTable(
  "issue_reports",
  {
    id: id(),
    ticketNo: text("ticket_no").notNull(),
    userId: uuid("user_id").references(() => users.userId, { onDelete: "set null" }),
    contactEmail: text("contact_email").notNull().default(""),
    category: text("category").notNull().default("bug"), // bug | ai | account | payment | weekly | content | suggestion | other
    severity: text("severity").notNull().default("normal"), // low | normal | high | blocker
    title: text("title").notNull(),
    description: text("description").notNull(),
    errorCode: text("error_code").notNull().default(""),
    requestId: text("request_id").notNull().default(""),
    pageUrl: text("page_url").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    appVersion: text("app_version").notNull().default(""),
    attachmentId: uuid("attachment_id").references(() => storageObjects.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"), // open | in_progress | resolved | rejected | duplicate
    adminNote: text("admin_note").notNull().default(""),
    handledBy: uuid("handled_by").references(() => users.userId, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("issue_ticket_uq").on(t.ticketNo),
    index("issue_status_idx").on(t.status, t.createdAt),
    index("issue_user_idx").on(t.userId),
    index("issue_code_idx").on(t.errorCode),
  ],
);

export const faqEntries = pgTable(
  "faq_entries",
  {
    id: id(),
    slug: text("slug").notNull(),
    category: text("category").notNull().default("general"),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    relatedCodes: jsonb("related_codes").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    helpfulCount: integer("helpful_count").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("faq_slug_uq").on(t.slug), index("faq_cat_idx").on(t.category, t.sortOrder)],
);

export const legalDocuments = pgTable("legal_documents", {
  slug: text("slug").primaryKey(), // privacy | terms
  title: text("title").notNull(),
  version: text("version").notNull().default("1.0"),
  body: text("body").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updated(),
});
