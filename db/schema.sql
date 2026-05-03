CREATE DATABASE IF NOT EXISTS kg_recruit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE kg_recruit;

CREATE TABLE IF NOT EXISTS candidates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interview_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  template_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interview_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT NOT NULL,
  order_no INT NOT NULL,
  question_text TEXT NOT NULL,
  evaluation_criteria TEXT NOT NULL,
  ideal_answer_hint TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_template
    FOREIGN KEY (template_id) REFERENCES interview_templates(id),
  UNIQUE KEY uq_template_order (template_id, order_no)
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  candidate_id BIGINT NOT NULL,
  template_id BIGINT NOT NULL,
  current_question_no INT NOT NULL DEFAULT 1,
  status ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  CONSTRAINT fk_sessions_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  CONSTRAINT fk_sessions_template
    FOREIGN KEY (template_id) REFERENCES interview_templates(id)
);

CREATE TABLE IF NOT EXISTS interview_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  attempt_no INT NOT NULL,
  answer_text TEXT NOT NULL,
  ai_feedback TEXT NULL,
  is_accepted TINYINT(1) NOT NULL DEFAULT 0,
  ai_score DECIMAL(4,2) NULL,
  summary_for_recruiter TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_answers_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id),
  CONSTRAINT fk_answers_question
    FOREIGN KEY (question_id) REFERENCES interview_questions(id)
);

CREATE TABLE IF NOT EXISTS interview_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  overall_summary TEXT NOT NULL,
  strengths_json JSON NOT NULL,
  concerns_json JSON NOT NULL,
  follow_up_questions_json JSON NOT NULL,
  recommendation ENUM('PASS', 'REVIEW', 'REJECT') NOT NULL DEFAULT 'REVIEW',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id),
  UNIQUE KEY uq_reports_session (session_id)
);

INSERT INTO interview_templates (id, template_name)
VALUES (1, 'Screening Template Default')
ON DUPLICATE KEY UPDATE template_name = VALUES(template_name);

INSERT INTO interview_questions (template_id, order_no, question_text, evaluation_criteria, ideal_answer_hint)
VALUES
  (1, 1, 'Giới thiệu ngắn gọn về bản thân và kinh nghiệm liên quan đến vị trí ứng tuyển.', 'Nêu được kinh nghiệm liên quan, bối cảnh nghề nghiệp, mức độ phù hợp với vị trí.', 'Nêu số năm kinh nghiệm, lĩnh vực, loại dự án, vai trò cụ thể.'),
  (1, 2, 'Bạn biết gì về công ty và vì sao muốn ứng tuyển vào vị trí này?', 'Đánh giá mức độ tìm hiểu công ty và động lực ứng tuyển.', 'Nêu hiểu biết cơ bản về công ty, sản phẩm, văn hóa, lý do phù hợp.'),
  (1, 3, 'Hãy mô tả một dự án gần đây bạn trực tiếp tham gia và vai trò của bạn trong đó.', 'Cần nêu rõ bối cảnh, nhiệm vụ, hành động, kết quả.', 'Dùng cấu trúc STAR hoặc tương đương.'),
  (1, 4, 'Thành tích nghề nghiệp nào bạn thấy nổi bật nhất?', 'Đo mức độ sở hữu kết quả và khả năng lượng hóa thành tích.', 'Nên có số liệu hoặc tác động rõ ràng.'),
  (1, 5, 'Bạn từng gặp khó khăn lớn nào trong công việc và đã xử lý ra sao?', 'Đánh giá tư duy giải quyết vấn đề và mức độ chủ động.', 'Nêu vấn đề, cách xử lý, kết quả, bài học rút ra.'),
  (1, 6, 'Điểm mạnh chuyên môn lớn nhất của bạn là gì?', 'Đánh giá mức độ tự nhận thức và độ phù hợp với vị trí.', 'Nên gắn với ví dụ thực tế.'),
  (1, 7, 'Điểm nào bạn còn cần cải thiện và bạn đang cải thiện bằng cách nào?', 'Đánh giá sự trung thực, khả năng tự phát triển.', 'Nêu điểm yếu có thật và cách cải thiện cụ thể.'),
  (1, 8, 'Mức lương mong muốn và thời gian có thể bắt đầu làm việc?', 'Thu thập thông tin phục vụ sàng lọc thực tế.', 'Nêu khoảng lương, notice period, điều kiện liên quan.'),
  (1, 9, 'Bạn ưu tiên điều gì ở môi trường làm việc tiếp theo?', 'Đánh giá độ tương thích với môi trường công ty.', 'Nêu rõ kỳ vọng về đội nhóm, quản lý, học hỏi, quy trình.'),
  (1, 10, 'Bạn có muốn bổ sung thông tin nào để hỗ trợ hồ sơ ứng tuyển của mình không?', 'Mở để ứng viên bổ sung điểm mạnh hoặc thông tin còn thiếu.', 'Có thể bổ sung chứng chỉ, dự án, giải thưởng, định hướng.');
