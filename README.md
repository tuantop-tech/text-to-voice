# Text → Voice

Ứng dụng đơn giản: **dán đoạn văn → chọn giọng → theo dõi tiến trình từng đoạn → nghe / tải audio về**.

Không có phòng live, kịch bản, hàng đợi hay bình luận — chỉ làm đúng một việc.

## Tính năng

- 🎙️ Chuyển văn bản thành giọng nói tiếng Việt (không giới hạn độ dài).
- 📊 Tiến trình theo từng đoạn: ⏳ chờ → 🔵 đang tạo → ✅ hoàn thành (kèm số giây).
- 🔐 Đăng nhập, quản lý giọng, cấu hình provider.
- 🦜 Dùng **VieNeu-TTS** self-host miễn phí (25 giọng preset, clone 3–8s) hoặc **ElevenLabs** (dự phòng).
- 🧩 Cắt đúng ranh giới câu, ghép audio thành 1 file, chèn nghỉ ngắn giữa các câu.

## Yêu cầu

- **Node.js 22+** (dùng `node:sqlite`, không cần cài database).
- **Python 3.10+** nếu dùng giọng VieNeu local.
- Không bắt buộc Docker.

## Cài đặt & chạy

### 1. Web app

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# đổi SESSION_SECRET trong .env
npm run dev
```

Mở http://localhost:3000 → đăng nhập `admin` / `admin123`.

> Nếu PowerShell báo lỗi `npm.ps1`, dùng `cmd /c npm install` / `cmd /c npm run dev`.

### 2. Giọng VieNeu (khuyến nghị)

```bash
pip install vieneu fastapi uvicorn python-multipart
cd vieneu-server
python -u server.py
```

API chạy ở `http://127.0.0.1:8000/v1`. Sau đó vào web:

1. **Cài đặt** → `TTS_PROVIDER = vieneu` (mặc định), giữ URL mặc định → Lưu.
2. **Thư viện giọng** → **Nhập tất cả** → 25 giọng preset (⭐ là giọng nên dùng).
3. **Chuyển văn bản** → chọn giọng → dán text → bấm **Tạo giọng nói**.

Ngoài ra có thể dùng Docker: `docker compose -f docker/docker-compose.yml --profile api-cpu up` trong repo gốc của VieNeu.

Không có API key/service: app vẫn chạy ở chế độ demo (tiếng beep) để test giao diện.

## Cấu trúc

```
src/app/(dashboard)/dashboard   Trang chuyển văn bản + tiến trình
src/app/(dashboard)/voices      Thư viện giọng (preset + clone)
src/app/(dashboard)/settings    Provider, API key, thành viên
src/app/api/tts                 Tạo job / poll tiến trình / audio
src/app/api/audio/[id]          Phục vụ file audio
src/lib/integrations.ts         VieNeu / ElevenLabs / demo
src/lib/audio.ts                Ghép WAV
src/lib/db.ts                   SQLite (node:sqlite)
vieneu-server/server.py         API wrapper giọng VieNeu (CPU/GPU)
data/                           DB + audio (đã gitignore)
```

## Lưu ý

- Trên CPU, VieNeu RTF ≈ 0.5 → đoạn rất dài có thể mất vài phút; app chạy ngầm và hiển thị tiến trình.
- Clone giọng người khác cần sự đồng ý của họ.
- Không commit `data/`, `.env`, `node_modules` lên git.
