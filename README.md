# Text → Voice

Ứng dụng đơn giản: **dán đoạn văn → chọn giọng → tạo audio → nghe/tải về**. Không còn phòng live, kịch bản, hàng đợi hay bình luận.

## Chạy

```powershell
cd "D:\Web TTS\livestream-ai"
cmd /c npm run dev
```

Mở http://localhost:3000 → đăng nhập `admin` / `admin123`.

> NPM trên máy này bị chặn bởi PowerShell execution policy nên dùng `cmd /c npm ...`.

Cần **2 terminal** nếu dùng giọng VieNeu:

```powershell
# Terminal 1 - web
cd "D:\Web TTS\livestream-ai"
cmd /c npm run start

# Terminal 2 - giọng VieNeu (API ở :8000)
cd "D:\Web TTS\livestream-ai\vieneu-server"
python -u server.py
```

## Giọng nói

- Mặc định dùng **VieNeu-TTS** self-host (`http://127.0.0.1:8000/v1`): 25 giọng preset tiếng Việt, clone 3–8s, miễn phí.
- Vào **Thư viện giọng** → bấm **"Nhập tất cả"** để lấy 25 giọng preset → chọn giọng (nên dùng các giọng có ⭐ như Mai Anh, Hải Đăng, Trúc Ly).
- Có thể đổi sang **ElevenLabs** trong trang **Cài đặt** nếu có API key.
- Không có API key/service: vẫn chạy ở chế độ demo (tiếng beep) để test giao diện.

## Cấu trúc ngắn gọn

```
src/app/(dashboard)/dashboard   Trang chuyển văn bản → giọng
src/app/(dashboard)/voices      Thư viện giọng (preset + clone)
src/app/(dashboard)/settings    API key, provider
src/app/api/tts                 Nhận text + voiceId → file audio
src/app/api/audio/[id]          Phục vụ file audio
src/lib/integrations.ts         VieNeu / ElevenLabs / demo
src/lib/db.ts                   SQLite (node:sqlite)
data/                           DB + file audio (gitignore)
```

## Lưu ý

- Không giới hạn độ dài đoạn văn. Với đoạn rất dài trên CPU, thời gian tạo audio sẽ tương ứng dài hơn (VieNeu RTF ≈ 0.5).
- Clone giọng người khác cần sự đồng ý của họ.
- Không commit `data/` và `.env` lên git.
