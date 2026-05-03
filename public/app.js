const candidateForm = document.getElementById("candidate-form");
const answerForm = document.getElementById("answer-form");
const answerInput = document.getElementById("answer-input");
const chatLog = document.getElementById("chat-log");
const reportBox = document.getElementById("report-box");
const reportContent = document.getElementById("report-content");
const printReportButton = document.getElementById("print-report");
const statusBar = document.getElementById("status-bar");

let sessionId = null;
let currentQuestionNo = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appendMessage(role, title, text) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;
  wrapper.innerHTML = `
    <span class="meta">${escapeHtml(title)}</span>
    <div>${escapeHtml(text).replace(/\n/g, "<br>")}</div>
  `;
  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setStatus(text) {
  if (!text) {
    statusBar.classList.add("hidden");
    statusBar.textContent = "";
    return;
  }

  statusBar.textContent = text;
  statusBar.classList.remove("hidden");
}

async function startInterview(formData) {
  const response = await fetch("/api/interview/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Không thể bắt đầu phỏng vấn.");
  }

  sessionId = data.sessionId;
  currentQuestionNo = data.question.orderNo;
  answerForm.classList.remove("hidden");
  setStatus(`Đang ở câu ${currentQuestionNo}/10`);
  appendMessage("ai", "AI Recruiter", `Câu ${data.question.orderNo}: ${data.question.text}`);
}

async function submitAnswer(answer) {
  const response = await fetch(`/api/interview/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Không thể gửi câu trả lời.");
  }

  if (!data.completed) {
    appendMessage("ai", "AI Recruiter", data.feedback);
    if (data.nextQuestion) {
      currentQuestionNo = data.nextQuestion.orderNo;
      setStatus(`Đang ở câu ${currentQuestionNo}/10`);
      appendMessage(
        "ai",
        "AI Recruiter",
        `Câu ${data.nextQuestion.orderNo}: ${data.nextQuestion.text}`
      );
    }
    return;
  }

  appendMessage("ai", "AI Recruiter", data.feedback);
  appendMessage("ai", "AI Recruiter", "Phần phỏng vấn sơ lọc đã hoàn tất.");
  setStatus("Đã hoàn tất phần phỏng vấn sơ lọc");
  answerForm.classList.add("hidden");
  await loadReport();
}

function renderAttempt(attempt) {
  return `
    <div class="attempt">
      <p><strong>Lần ${escapeHtml(attempt.attemptNo)}</strong> | <strong>Điểm AI:</strong> ${escapeHtml(attempt.score)}/10 | <strong>Đạt:</strong> ${attempt.accepted ? "Có" : "Chưa"}</p>
      <p><strong>Trả lời:</strong> ${escapeHtml(attempt.answerText)}</p>
      <p><strong>Phản hồi AI:</strong> ${escapeHtml(attempt.feedback || "-")}</p>
    </div>
  `;
}

function renderQuestionBlock(item) {
  return `
    <div class="report-card">
      <h3>Câu ${escapeHtml(item.orderNo)}</h3>
      <div class="report-block"><strong>Câu hỏi:</strong> ${escapeHtml(item.questionText)}</div>
      ${item.attempts.map(renderAttempt).join("")}
    </div>
  `;
}

async function loadReport() {
  const response = await fetch(`/api/interview/${sessionId}/report`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Không thể tải report.");
  }

  const report = data.report;
  reportBox.classList.remove("hidden");
  reportContent.innerHTML = `
    <div class="report-card">
      <h3>Thông tin ứng viên</h3>
      <p><strong>Ứng viên:</strong> ${escapeHtml(data.session.full_name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(data.session.email)}</p>
      <p><strong>Điện thoại:</strong> ${escapeHtml(data.session.phone || "-")}</p>
      <p><strong>Vị trí ứng tuyển:</strong> ${escapeHtml(data.session.applied_position || "-")}</p>
      <p><strong>Kết luận:</strong> ${escapeHtml(report?.recommendation || "REVIEW")}</p>
      <p><strong>Tóm tắt:</strong> ${escapeHtml(report?.overallSummary || "Chưa có")}</p>
      <p><strong>Điểm mạnh:</strong></p>
      <ul class="report-list">
        ${(report?.strengths || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>-</li>"}
      </ul>
      <p><strong>Rủi ro / lưu ý:</strong></p>
      <ul class="report-list">
        ${(report?.concerns || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>-</li>"}
      </ul>
      <p><strong>Câu hỏi follow-up:</strong></p>
      <ul class="report-list">
        ${(report?.followUpQuestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>-</li>"}
      </ul>
    </div>
    ${(data.answers || []).map(renderQuestionBlock).join("")}
  `;
}

candidateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(candidateForm).entries());
  candidateForm.querySelector("button").disabled = true;

  try {
    appendMessage("ai", "System", "Đang khởi tạo phiên phỏng vấn...");
    await startInterview(formData);
  } catch (error) {
    appendMessage("ai", "System", error.message);
    candidateForm.querySelector("button").disabled = false;
  }
});

answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = answerInput.value.trim();
  if (!answer) {
    return;
  }

  appendMessage("user", "Ứng viên", answer);
  answerInput.value = "";

  try {
    await submitAnswer(answer);
  } catch (error) {
    appendMessage("ai", "System", error.message);
  }
});

printReportButton.addEventListener("click", () => {
  window.print();
});
