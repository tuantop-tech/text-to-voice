# Text → Voice

Ứng dụng đơn giản: **dán đoạn văn → chọn giọng → theo dõi tiến trình từng đoạn → nghe / tải audio về**.

Không có phòng live, kịch bản, hàng đợi hay bình luận — chỉ làm đúng một việc.

## 📦 Tải bản cài đặt (Windows)

👉 **https://github.com/tuantop-tech/text-to-voice/releases/latest**

Tải file `Text to Voice Setup 1.0.2.exe` (~602 MB), chạy cài đặt, mở app từ Start Menu.
Đăng nhập: `admin` / `admin123`. Mặc định dùng **VieNeu-TTS** + giọng **Phương** (đã đóng gói sẵn).
Lần đầu chạy cần internet để tải model VieNeu (~300 MB); sau đó dùng offline được.

> ⚠️ **Nếu máy đã cài bản cũ: hãy gỡ bản cũ trước (Settings → Apps → Text to Voice → Uninstall), rồi mới chạy file Setup mới.**
> Cài đè lên bản cũ có thể giữ lại file JS của phiên bản trước, làm cửa sổ **Lời Thoại Phát Live** dùng nhầm logic cũ và **không tự phát lại khi hết đoạn**.
> Bản 1.0.1 đã thêm watchdog + retry phát audio, nhưng chỉ phát huy tối đa khi cài sạch.

*Lưu ý: file EXE không nằm trong repo (GitHub giới hạn 100 MB/file) mà được đăng ở mục Releases.*

## Tính năng

- 🎙️ Chuyển văn bản thành giọng nói tiếng Việt (không giới hạn độ dài).
- 📊 Tiến trình theo từng đoạn: ⏳ chờ → 🔵 đang tạo → ✅ hoàn thành (kèm số giây).
- 🔐 Đăng nhập, quản lý giọng, cấu hình provider.
- 🦜 Dùng **VieNeu-TTS** self-host miễn phí (26 giọng gồm giọng **Phương** clone sẵn, đóng gói cùng app) hoặc **ElevenLabs** (dự phòng).
- 🪟 Cửa sổ riêng **Lời Thoại Phát Live**: chữ Karaoke căn giữa, Play/Pause, phím Space (dừng hết câu → câu kế từ đầu), chỉnh tốc độ, tự đọc lại với tốc độ mới, đồng hồ "Đã chạy (cả phiên)" cộng dồn + "Còn lại".
- 💾 Tự lưu kịch bản + giọng + audio; chỉ bấm **Tạo mới** mới xóa để làm cái khác.
- 🧩 Đoạn dài tự chia thành nhiều request nhỏ rồi ghép audio lại, tránh timeout 20 phút và không còn rơi về audio beep. Mốc câu Karaoke được tính theo thời lượng thực của từng request.

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
