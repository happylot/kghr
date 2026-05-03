# AI Screening Interview Prototype

Prototype này triển khai luồng sơ lọc bằng hội thoại AI và lưu dữ liệu vào Google Sheets.

- Ứng viên trả lời theo dạng hội thoại thay vì điền Google Form.
- Mỗi câu được AI kiểm tra mức độ đầy đủ và đúng trọng tâm.
- Nếu câu trả lời chưa đạt, AI yêu cầu bổ sung.
- Tối đa 3 lần cho mỗi câu, sau đó tự chuyển tiếp.
- Kết thúc sẽ sinh report tổng hợp để người phỏng vấn đọc trước vòng vấn đáp.

## Kiến trúc

### Frontend

- `public/index.html`: giao diện hội thoại thuần HTML
- `public/styles.css`: giao diện responsive
- `public/app.js`: điều phối chat, gửi câu trả lời, tải report

### Backend

- `server.js`: Express API + logic gọi OpenAI + lưu Google Sheets

## Luồng xử lý

1. Ứng viên nhập thông tin cơ bản và bắt đầu phiên phỏng vấn.
2. Hệ thống lấy câu hỏi hiện tại từ tab `questions`.
3. Ứng viên trả lời.
4. Backend gọi OpenAI để đánh giá:
   - Có đúng trọng tâm không
   - Có đủ ý không
   - Có cần bổ sung gì không
5. Nếu chưa đạt và chưa quá 3 lần:
   - Giữ nguyên câu hiện tại
   - Trả feedback để ứng viên bổ sung
6. Nếu đạt hoặc đã quá 3 lần:
   - Chuyển sang câu tiếp theo
7. Khi hết 10 câu:
   - Tạo report tổng hợp
   - Lưu report vào tab `reports`
   - Hiển thị để in

## Stack phù hợp

- Frontend: HTML/CSS/JS thuần
- Backend: Node.js + Express
- Lưu trữ: Google Sheets
- AI: OpenAI API

## Cài đặt

1. Tạo một Google Spreadsheet.
2. Tạo Google service account và tải file JSON key về project, ví dụ `google-service-account.json`.
3. Share spreadsheet cho email của service account với quyền `Editor`.
4. Điền file `.env`:
   - `OPENAI_API_KEY`
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`
5. Cài dependency:

```bash
npm install
```

6. Chạy ứng dụng:

```bash
npm run dev
```

7. Mở:

```text
http://localhost:3000
```

## CI/CD

Workflow GitHub Actions nằm tại `.github/workflows/deploy.yml`.

Khi push lên branch `main`, workflow sẽ:

- Cài dependencies và kiểm tra cú pháp `server.js`.
- Đồng bộ source lên VPS tại `/var/www/kg.comtv.top`.
- Giữ nguyên `.env` và `google-service-account.json` đang có trên VPS.
- Chạy `npm ci --omit=dev`, restart `pm2` app `kg-recruit`, và kiểm tra `/api/health`.

Repository cần có các GitHub Secrets sau:

- `VPS_HOST`: IP hoặc hostname VPS, ví dụ `14.225.7.175`
- `VPS_PORT`: SSH port, ví dụ `1786`
- `VPS_USER`: SSH user, ví dụ `root`
- `VPS_PASSWORD`: SSH password

## Cấu trúc Google Sheet

App sẽ tự tạo các tab sau nếu chưa có:

- `questions`
- `candidates`
- `sessions`
- `answers`
- `reports`

Tab `questions` sẽ được seed sẵn 10 câu mặc định.

## Gợi ý mở rộng

- Thêm đăng nhập cho HR/Admin
- Quản lý nhiều bộ đề cho nhiều vị trí ngay trong Google Sheets
- Chấm điểm theo từng năng lực
- Xuất PDF report
- Ghi âm hoặc speech-to-text để ứng viên trả lời bằng giọng nói
- Đồng bộ lịch sử vấn đáp sau vòng phỏng vấn trực tiếp
# kghr
