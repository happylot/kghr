const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const port = Number(process.env.PORT || 3000);
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountKeyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

const SHEETS = {
  QUESTIONS: "questions",
  CANDIDATES: "candidates",
  SESSIONS: "sessions",
  ANSWERS: "answers",
  REPORTS: "reports"
};

const SHEET_HEADERS = {
  [SHEETS.QUESTIONS]: [
    "id",
    "template_id",
    "order_no",
    "question_text",
    "evaluation_criteria",
    "ideal_answer_hint"
  ],
  [SHEETS.CANDIDATES]: ["id", "full_name", "email", "phone", "created_at", "applied_position"],
  [SHEETS.SESSIONS]: [
    "id",
    "candidate_id",
    "template_id",
    "current_question_no",
    "status",
    "started_at",
    "finished_at"
  ],
  [SHEETS.ANSWERS]: [
    "id",
    "session_id",
    "question_id",
    "attempt_no",
    "answer_text",
    "ai_feedback",
    "is_accepted",
    "ai_score",
    "summary_for_recruiter",
    "created_at"
  ],
  [SHEETS.REPORTS]: [
    "session_id",
    "overall_summary",
    "strengths_json",
    "concerns_json",
    "follow_up_questions_json",
    "recommendation",
    "updated_at"
  ]
};

const DEFAULT_QUESTIONS = [
  [
    "q1",
    "1",
    "1",
    "Giới thiệu ngắn gọn về bản thân và kinh nghiệm liên quan đến vị trí ứng tuyển.",
    "Nêu được kinh nghiệm liên quan, bối cảnh nghề nghiệp, mức độ phù hợp với vị trí.",
    "Nêu số năm kinh nghiệm, lĩnh vực, loại dự án, vai trò cụ thể."
  ],
  [
    "q2",
    "1",
    "2",
    "Bạn biết gì về công ty và vì sao muốn ứng tuyển vào vị trí này?",
    "Đánh giá mức độ tìm hiểu công ty và động lực ứng tuyển.",
    "Nêu hiểu biết cơ bản về công ty, sản phẩm, văn hóa, lý do phù hợp."
  ],
  [
    "q3",
    "1",
    "3",
    "Hãy mô tả một dự án gần đây bạn trực tiếp tham gia và vai trò của bạn trong đó.",
    "Cần nêu rõ bối cảnh, nhiệm vụ, hành động, kết quả.",
    "Dùng cấu trúc STAR hoặc tương đương."
  ],
  [
    "q4",
    "1",
    "4",
    "Thành tích nghề nghiệp nào bạn thấy nổi bật nhất?",
    "Đo mức độ sở hữu kết quả và khả năng lượng hóa thành tích.",
    "Nên có số liệu hoặc tác động rõ ràng."
  ],
  [
    "q5",
    "1",
    "5",
    "Bạn từng gặp khó khăn lớn nào trong công việc và đã xử lý ra sao?",
    "Đánh giá tư duy giải quyết vấn đề và mức độ chủ động.",
    "Nêu vấn đề, cách xử lý, kết quả, bài học rút ra."
  ],
  [
    "q6",
    "1",
    "6",
    "Điểm mạnh chuyên môn lớn nhất của bạn là gì?",
    "Đánh giá mức độ tự nhận thức và độ phù hợp với vị trí.",
    "Nên gắn với ví dụ thực tế."
  ],
  [
    "q7",
    "1",
    "7",
    "Điểm nào bạn còn cần cải thiện và bạn đang cải thiện bằng cách nào?",
    "Đánh giá sự trung thực, khả năng tự phát triển.",
    "Nêu điểm yếu có thật và cách cải thiện cụ thể."
  ],
  [
    "q8",
    "1",
    "8",
    "Mức lương mong muốn và thời gian có thể bắt đầu làm việc?",
    "Thu thập thông tin phục vụ sàng lọc thực tế.",
    "Nêu khoảng lương, notice period, điều kiện liên quan."
  ],
  [
    "q9",
    "1",
    "9",
    "Bạn ưu tiên điều gì ở môi trường làm việc tiếp theo?",
    "Đánh giá độ tương thích với môi trường công ty.",
    "Nêu rõ kỳ vọng về đội nhóm, quản lý, học hỏi, quy trình."
  ],
  [
    "q10",
    "1",
    "10",
    "Bạn có muốn bổ sung thông tin nào để hỗ trợ hồ sơ ứng tuyển của mình không?",
    "Mở để ứng viên bổ sung điểm mạnh hoặc thông tin còn thiếu.",
    "Có thể bổ sung chứng chỉ, dự án, giải thưởng, định hướng."
  ]
];

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let sheetsClientPromise;

function nowIso() {
  return new Date().toISOString();
}

function toSafeScore(value) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(10, Math.max(0, score));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function absoluteKeyPath() {
  if (!serviceAccountKeyFile) {
    return null;
  }

  return path.isAbsolute(serviceAccountKeyFile)
    ? serviceAccountKeyFile
    : path.join(__dirname, serviceAccountKeyFile);
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const keyPath = absoluteKeyPath();
      if (!spreadsheetId || !keyPath || !fs.existsSync(keyPath)) {
        throw new Error("Google Sheets chưa được cấu hình đầy đủ.");
      }

      const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });

      const client = await auth.getClient();
      return google.sheets({ version: "v4", auth: client });
    })();
  }

  return sheetsClientPromise;
}

async function getRows(sheetName) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`
  });

  const values = response.data.values || [];
  if (!values.length) {
    return [];
  }

  const [headers, ...rows] = values;
  return rows.map((row, rowIndex) => {
    const record = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });
    return record;
  });
}

async function appendRow(sheetName, values) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values]
    }
  });
}

async function updateRow(sheetName, rowNumber, values) {
  const sheets = await getSheetsClient();
  const endColumn = String.fromCharCode(64 + values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values]
    }
  });
}

async function ensureSheetExists(sheetName, headers, seedRows = []) {
  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (spreadsheet.data.sheets || []).some(
    (sheet) => sheet.properties && sheet.properties.title === sheetName
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }
        ]
      }
    });
  }

  const rows = await getRows(sheetName);
  if (!rows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [headers, ...seedRows]
      }
    });
    return;
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`
  });
  const existingHeaders = response.data.values?.[0] || [];
  const missingHeaders = headers.filter((header) => !existingHeaders.includes(header));

  if (missingHeaders.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[...existingHeaders, ...missingHeaders]]
      }
    });
  }
}

async function ensureSheetsBootstrap() {
  await ensureSheetExists(SHEETS.QUESTIONS, SHEET_HEADERS[SHEETS.QUESTIONS], DEFAULT_QUESTIONS);
  await ensureSheetExists(SHEETS.CANDIDATES, SHEET_HEADERS[SHEETS.CANDIDATES]);
  await ensureSheetExists(SHEETS.SESSIONS, SHEET_HEADERS[SHEETS.SESSIONS]);
  await ensureSheetExists(SHEETS.ANSWERS, SHEET_HEADERS[SHEETS.ANSWERS]);
  await ensureSheetExists(SHEETS.REPORTS, SHEET_HEADERS[SHEETS.REPORTS]);
}

async function nextId(sheetName, prefix) {
  const rows = await getRows(sheetName);
  return `${prefix}${rows.length + 1}`;
}

async function getTemplateQuestions(templateId) {
  const rows = await getRows(SHEETS.QUESTIONS);
  return rows
    .filter((row) => String(row.template_id) === String(templateId))
    .sort((a, b) => Number(a.order_no) - Number(b.order_no));
}

async function getQuestionMap() {
  const rows = await getRows(SHEETS.QUESTIONS);
  return new Map(rows.map((row) => [row.id, row]));
}

async function getCandidateById(candidateId) {
  const rows = await getRows(SHEETS.CANDIDATES);
  return rows.find((row) => row.id === candidateId) || null;
}

async function getSessionById(sessionId) {
  const rows = await getRows(SHEETS.SESSIONS);
  return rows.find((row) => row.id === sessionId) || null;
}

function getAppliedPosition(candidate) {
  return String(candidate?.applied_position || "").trim() || "Chưa cung cấp";
}

function questionTextForCandidate(question, appliedPosition) {
  if (!appliedPosition || appliedPosition === "Chưa cung cấp") {
    return question.question_text;
  }

  return `Cho vị trí ${appliedPosition}: ${question.question_text}`;
}

async function evaluateAnswer(question, answer, attemptNo, appliedPosition) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `
Bạn là AI sơ lọc ứng viên.
Hãy đánh giá xem câu trả lời của ứng viên cho câu hỏi bên dưới đã đủ ý, đủ chi tiết, đúng trọng tâm và phù hợp với vị trí ứng tuyển chưa.

Yêu cầu:
- Nếu câu trả lời đạt: accepted = true.
- Nếu chưa đạt: accepted = false.
- feedback_for_candidate phải ngắn, rõ, chỉ ra phần còn thiếu để ứng viên bổ sung ở lần tiếp theo.
- score_over_10 là điểm tham khảo cho nhà tuyển dụng.
- missing_points là mảng các ý còn thiếu.
- summary_for_recruiter là tóm tắt ngắn cho nội bộ.
- Luôn đánh giá theo bối cảnh vị trí ứng tuyển. Câu trả lời càng liên quan trực tiếp đến vị trí thì điểm càng cao.
- Không được viết ngoài JSON.

Trả về JSON đúng cấu trúc:
{
  "accepted": true,
  "score_over_10": 8,
  "feedback_for_candidate": "string",
  "missing_points": ["string"],
  "summary_for_recruiter": "string"
}

Câu hỏi: ${question.question_text}
Vị trí ứng tuyển: ${appliedPosition}
Tiêu chí đánh giá: ${question.evaluation_criteria}
Gợi ý đáp án mong đợi: ${question.ideal_answer_hint || "Không có"}
Lần trả lời hiện tại: ${attemptNo}
Câu trả lời ứng viên: ${answer}
`;

  const response = await openai.responses.create({
    model,
    input: prompt
  });

  const parsed = safeJsonParse(response.output_text || "");
  if (!parsed) {
    return {
      accepted: answer.trim().length >= 80,
      score_over_10: answer.trim().length >= 80 ? 6 : 4,
      feedback_for_candidate: "Câu trả lời còn ngắn hoặc chưa rõ trọng tâm. Hãy bổ sung cụ thể hơn.",
      missing_points: ["Cần thêm chi tiết và bám sát câu hỏi"],
      summary_for_recruiter: "Fallback parser used because model output was not valid JSON."
    };
  }

  return {
    accepted: Boolean(parsed.accepted),
    score_over_10: toSafeScore(parsed.score_over_10),
    feedback_for_candidate: String(parsed.feedback_for_candidate || ""),
    missing_points: Array.isArray(parsed.missing_points) ? parsed.missing_points : [],
    summary_for_recruiter: String(parsed.summary_for_recruiter || "")
  };
}

async function loadSessionState(sessionId) {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const candidate = await getCandidateById(session.candidate_id);
  const questions = await getTemplateQuestions(session.template_id);
  const currentQuestion =
    questions.find((q) => Number(q.order_no) === Number(session.current_question_no)) || null;

  return { session, candidate, questions, currentQuestion };
}

async function generateFinalReport(sessionId) {
  const session = await getSessionById(sessionId);
  const candidate = await getCandidateById(session.candidate_id);
  const appliedPosition = getAppliedPosition(candidate);
  const questionMap = await getQuestionMap();
  const answers = (await getRows(SHEETS.ANSWERS))
    .filter((row) => row.session_id === sessionId)
    .sort((a, b) => {
      const aQuestion = Number(questionMap.get(a.question_id)?.order_no || 0);
      const bQuestion = Number(questionMap.get(b.question_id)?.order_no || 0);
      if (aQuestion !== bQuestion) {
        return aQuestion - bQuestion;
      }
      return Number(a.attempt_no) - Number(b.attempt_no);
    });

  const grouped = [];
  for (const row of answers) {
    const question = questionMap.get(row.question_id);
    let item = grouped.find((entry) => entry.order_no === Number(question.order_no));
    if (!item) {
      item = {
        order_no: Number(question.order_no),
        question_text: questionTextForCandidate(question, appliedPosition),
        attempts: []
      };
      grouped.push(item);
    }

    item.attempts.push({
      attempt_no: Number(row.attempt_no),
      answer_text: row.answer_text,
      ai_feedback: row.ai_feedback,
      is_accepted: row.is_accepted === "1",
      ai_score: Number(row.ai_score || 0),
      summary_for_recruiter: row.summary_for_recruiter
    });
  }

  const prompt = `
Bạn là trợ lý tuyển dụng. Dựa trên phần phỏng vấn sơ lọc dưới đây, hãy tạo report ngắn gọn, thực dụng để người phỏng vấn vấn đáp đọc trước khi gặp ứng viên.

Trả về JSON:
{
  "overall_summary": "string",
  "strengths": ["string"],
  "concerns": ["string"],
  "follow_up_questions": ["string"],
  "recommendation": "PASS | REVIEW | REJECT"
}

Thông tin ứng viên:
- Họ tên: ${candidate.full_name}
- Email: ${candidate.email}
- Số điện thoại: ${candidate.phone}
- Vị trí ứng tuyển: ${getAppliedPosition(candidate)}

Nội dung phỏng vấn:
${JSON.stringify(grouped, null, 2)}
`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: prompt
  });

  const parsed = safeJsonParse(response.output_text || "");
  const report = parsed || {
    overall_summary: "Chưa tạo được đánh giá tổng hợp chuẩn JSON từ AI.",
    strengths: [],
    concerns: ["Cần đọc lại toàn bộ câu trả lời gốc."],
    follow_up_questions: ["Làm rõ thêm kinh nghiệm và mức độ phù hợp công việc."],
    recommendation: "REVIEW"
  };

  const reports = await getRows(SHEETS.REPORTS);
  const existing = reports.find((row) => row.session_id === sessionId);
  const values = [
    sessionId,
    report.overall_summary || "",
    JSON.stringify(report.strengths || []),
    JSON.stringify(report.concerns || []),
    JSON.stringify(report.follow_up_questions || []),
    report.recommendation || "REVIEW",
    nowIso()
  ];

  if (existing) {
    await updateRow(SHEETS.REPORTS, existing.__rowNumber, values);
  } else {
    await appendRow(SHEETS.REPORTS, values);
  }
}

app.get("/api/health", async (_req, res) => {
  const health = {
    server: "ok",
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    googleSheetsConfigured: Boolean(spreadsheetId && serviceAccountKeyFile),
    googleSheetsReachable: false
  };

  try {
    await ensureSheetsBootstrap();
    health.googleSheetsReachable = true;
  } catch {
    health.googleSheetsReachable = false;
  }

  res.json(health);
});

app.post("/api/interview/start", async (req, res) => {
  try {
    await ensureSheetsBootstrap();

    const { fullName, email, phone, appliedPosition, templateId = 1 } = req.body;
    if (!fullName || !email || !appliedPosition) {
      return res.status(400).json({ error: "Thiếu họ tên, email hoặc vị trí ứng tuyển." });
    }

    const candidateId = await nextId(SHEETS.CANDIDATES, "cand_");
    const sessionId = await nextId(SHEETS.SESSIONS, "sess_");

    await appendRow(SHEETS.CANDIDATES, [
      candidateId,
      fullName,
      email,
      phone || "",
      nowIso(),
      appliedPosition
    ]);
    await appendRow(SHEETS.SESSIONS, [
      sessionId,
      candidateId,
      String(templateId),
      "1",
      "IN_PROGRESS",
      nowIso(),
      ""
    ]);

    const questions = await getTemplateQuestions(templateId);
    if (!questions.length) {
      return res.status(400).json({ error: "Template chưa có câu hỏi." });
    }

    res.json({
      sessionId,
      candidateId,
      question: {
        orderNo: Number(questions[0].order_no),
        text: questionTextForCandidate(questions[0], appliedPosition)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Không thể khởi tạo phiên phỏng vấn." });
  }
});

app.get("/api/interview/:sessionId/current", async (req, res) => {
  try {
    await ensureSheetsBootstrap();
    const state = await loadSessionState(req.params.sessionId);
    if (!state) {
      return res.status(404).json({ error: "Không tìm thấy phiên phỏng vấn." });
    }

    res.json({
      sessionId: state.session.id,
      status: state.session.status,
      question: state.currentQuestion
        ? {
            orderNo: Number(state.currentQuestion.order_no),
            text: questionTextForCandidate(
              state.currentQuestion,
              getAppliedPosition(state.candidate)
            )
          }
        : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Không thể tải trạng thái phiên phỏng vấn." });
  }
});

app.post("/api/interview/:sessionId/answer", async (req, res) => {
  try {
    await ensureSheetsBootstrap();

    const { answer } = req.body;
    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: "Câu trả lời không được để trống." });
    }

    const state = await loadSessionState(req.params.sessionId);
    if (!state || !state.currentQuestion) {
      return res.status(404).json({ error: "Không còn câu hỏi hiện tại." });
    }

    const answers = await getRows(SHEETS.ANSWERS);
    const relatedAttempts = answers.filter(
      (row) => row.session_id === state.session.id && row.question_id === state.currentQuestion.id
    );

    const attemptNo = relatedAttempts.length + 1;
    const appliedPosition = getAppliedPosition(state.candidate);
    const evaluation = await evaluateAnswer(
      state.currentQuestion,
      answer,
      attemptNo,
      appliedPosition
    );
    const forcedAdvance = !evaluation.accepted && attemptNo >= 3;
    const answerId = await nextId(SHEETS.ANSWERS, "ans_");

    await appendRow(SHEETS.ANSWERS, [
      answerId,
      state.session.id,
      state.currentQuestion.id,
      String(attemptNo),
      answer,
      evaluation.feedback_for_candidate,
      evaluation.accepted ? "1" : "0",
      String(evaluation.score_over_10),
      evaluation.summary_for_recruiter,
      nowIso()
    ]);

    if (!evaluation.accepted && !forcedAdvance) {
      return res.json({
        accepted: false,
        attemptNo,
        feedback: `Câu trả lời chưa đạt. ${evaluation.feedback_for_candidate} Bạn còn ${3 - attemptNo} lần bổ sung cho câu này.`,
        nextQuestion: null,
        completed: false
      });
    }

    const nextQuestionNo = Number(state.session.current_question_no) + 1;
    const nextQuestion =
      state.questions.find((q) => Number(q.order_no) === nextQuestionNo) || null;

    await updateRow(SHEETS.SESSIONS, state.session.__rowNumber, [
      state.session.id,
      state.session.candidate_id,
      state.session.template_id,
      String(nextQuestionNo),
      nextQuestion ? "IN_PROGRESS" : "COMPLETED",
      state.session.started_at,
      nextQuestion ? "" : nowIso()
    ]);

    if (!nextQuestion) {
      await generateFinalReport(state.session.id);

      return res.json({
        accepted: evaluation.accepted,
        forcedAdvance,
        attemptNo,
        feedback: forcedAdvance
          ? "Đã đủ 3 lần bổ sung. Hệ thống sẽ chuyển sang câu tiếp theo hoặc kết thúc phần phỏng vấn."
          : "Câu trả lời đã được ghi nhận.",
        nextQuestion: null,
        completed: true
      });
    }

    res.json({
      accepted: evaluation.accepted,
      forcedAdvance,
      attemptNo,
      feedback: forcedAdvance
        ? "Đã đủ 3 lần bổ sung. Hệ thống chuyển sang câu tiếp theo."
        : "Câu trả lời đã đạt yêu cầu. Chuyển sang câu tiếp theo.",
      nextQuestion: {
        orderNo: Number(nextQuestion.order_no),
        text: questionTextForCandidate(nextQuestion, appliedPosition)
      },
      completed: false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Không thể xử lý câu trả lời." });
  }
});

app.get("/api/interview/:sessionId/report", async (req, res) => {
  try {
    await ensureSheetsBootstrap();

    const session = await getSessionById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Không tìm thấy phiên phỏng vấn." });
    }

    const candidate = await getCandidateById(session.candidate_id);
    const reportRows = await getRows(SHEETS.REPORTS);
    const answerRows = await getRows(SHEETS.ANSWERS);
    const questionMap = await getQuestionMap();
    const appliedPosition = getAppliedPosition(candidate);

    const report = reportRows.find((row) => row.session_id === req.params.sessionId) || null;
    const groupedAnswers = [];

    answerRows
      .filter((row) => row.session_id === req.params.sessionId)
      .sort((a, b) => {
        const aQuestion = Number(questionMap.get(a.question_id)?.order_no || 0);
        const bQuestion = Number(questionMap.get(b.question_id)?.order_no || 0);
        if (aQuestion !== bQuestion) {
          return aQuestion - bQuestion;
        }
        return Number(a.attempt_no) - Number(b.attempt_no);
      })
      .forEach((row) => {
        const question = questionMap.get(row.question_id);
        let item = groupedAnswers.find(
          (entry) => entry.orderNo === Number(question.order_no)
        );

        if (!item) {
          item = {
            orderNo: Number(question.order_no),
            questionText: questionTextForCandidate(question, appliedPosition),
            attempts: []
          };
          groupedAnswers.push(item);
        }

        item.attempts.push({
          attemptNo: Number(row.attempt_no),
          answerText: row.answer_text,
          feedback: row.ai_feedback,
          accepted: row.is_accepted === "1",
          score: Number(row.ai_score || 0)
        });
      });

    res.json({
      session: {
        id: session.id,
        status: session.status,
        full_name: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        applied_position: getAppliedPosition(candidate)
      },
      report: report
        ? {
            overallSummary: report.overall_summary,
            strengths: JSON.parse(report.strengths_json || "[]"),
            concerns: JSON.parse(report.concerns_json || "[]"),
            followUpQuestions: JSON.parse(report.follow_up_questions_json || "[]"),
            recommendation: report.recommendation
          }
        : null,
      answers: groupedAnswers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Không thể tải report." });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
