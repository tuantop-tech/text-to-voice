# Text → Voice

Ứng dụng đơn giản: **dán đoạn văn → chọn giọng → theo dõi tiến trình từng đoạn → nghe / tải audio về**.

Không có phòng live, kịch bản, hàng đợi hay bình luận — chỉ làm đúng một việc.

## 📦 Tải bản cài đặt (Windows)

👉 **https://github.com/tuantop-tech/text-to-voice/releases/latest**

Tải file `Text to Voice Setup 1.0.5.exe` (~602 MB), chạy cài đặt, mở app từ Start Menu.
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
- ⏱️ Hỗ trợ ký hiệu nghỉ `[0.3]`, `[0.5]` trong lời thoại (chèn im lặng thật, TTS không đọc ký hiệu). Không cắt dấu chấm trong số như `300.000`, `[0.3]`.
- 🧠 **Giai đoạn 1 Fine-tuning (thử nghiệm)**: màn hình "Huấn luyện giọng", upload ghi âm dài → tự cắt clip 3–15s + nhận diện chữ bằng `faster-whisper` CPU → nghe thử/sửa text → lưu `./data/datasets/<tên giọng>/metadata.csv`. Chi tiết ở cuối README.

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

## 🧠 Fine-tuning Giai đoạn 1 — Chuẩn bị dataset

Màn hình **Huấn luyện giọng (Fine-tuning)** trong sidebar. Luồng xử lý:

```
upload .wav/.mp3 (có thể nhiều file)
  → ./data/datasets/<tên giọng>/uploads/
  → cắt theo đoạn im lặng thành clip 3–15 giây (16kHz mono)
  → ./data/datasets/<tên giọng>/raw_audio/clip_0001.wav ...
  → faster-whisper (CPU, model base hoặc small) nhận diện tiếng Việt
  → ./data/datasets/<tên giọng>/metadata.csv   (clip_0001.wav|nội dung)
  → ./data/datasets/<tên giọng>/segments.json  (để UI sửa text)
  → nghe thử / sửa chính tả → bấm "Lưu thay đổi" (ghi lại metadata.csv)
```

Thư mục luôn tính tương đối từ `DATA_DIR` (mặc định `./data` theo `process.cwd()`), không hardcode đường dẫn máy — code được trên máy không GPU, chuyển sang máy GPU vẫn chạy nguyên.

Cài dependency trên máy sẽ train (có GPU NVIDIA):

```bash
pip install -r vieneu-server/requirements-training.txt
```

Nếu màn hình báo "Chưa có faster-whisper", server giọng chưa cài thư viện — model `base`/`small` sẽ tự tải về `./data/models/whisper` trong lần đầu chạy (cần internet). Trên máy hiện tại đã test thành công với model `small` trên CPU.

## 🧠 Fine-tuning Giai đoạn 2 — LoRA

Trong màn hình **Huấn luyện giọng**, sau khi mở một dataset sẽ hiện khu vực **⚙️ Huấn luyện LoRA**:

- Tham số mặc định tối ưu cho GPU 6–8GB: `epochs 3`, `batch 4`, `grad-accum 4` (batch hiệu dụng 16), `lr 2e-4`.
- Nút **🚀 Bắt đầu huấn luyện** chạy background 3 bước theo đúng script chính thức của https://github.com/pnnbao97/VieNeu-TTS:

```
finetune/prepare_dataset.py --dataset-dir ./data/datasets/<giọng>
finetune/train_lora.py --data .../train.parquet --run <giọng> --output-dir .../model --merge
finetune/merge_lora.py --adapter .../model/<giọng>/adapter --out .../model/<giọng>/merged
```

- Log terminal và thanh % được ghi realtime vào `finetune_status.json`, UI poll mỗi giây.
- **Tự kiểm tra `torch.cuda.is_available()`**:
  - Không có CUDA → **dry-run** trong ~10 giây, in log mô phỏng và tạo model giả lập tại `./data/datasets/<giọng>/model/merged/` để test luồng giao diện.
  - Có CUDA → chạy pipeline thật.

Chuẩn bị trên máy GPU:

```bash
git clone https://github.com/pnnbao97/VieNeu-TTS.git ./data/vieneu-src
cd ./data/vieneu-src && uv sync --extra finetune
```

Trường "Repo VieNeu-TTS" trong UI mặc định `./vieneu-src` (tương đối bên trong `./data`). Có thể đổi nếu bạn clone chỗ khác; không hardcode đường dẫn máy trong code.

Sau khi train xong, model nằm ở `./data/datasets/<giọng>/model/<giọng>/merged` (dry-run: `.../model/merged`). Giai đoạn tiếp theo (chưa làm): gọi `make_voice.py` để đóng gói embedding và đăng ký giọng vào app.

## 🔊 Fine-tuning Giai đoạn 3 — Đóng gói & dùng giọng đã train

Ngay sau bước `merge_lora.py` (hoặc dry-run), app tự động đóng gói:

```
./data/outputs/trained_voices/<ten_giong>/
  model/                model đã merge (+ voices_v3_turbo.json)
  sample.wav            clip mẫu 5–8s lấy từ dataset
  transcript.txt        transcript của clip mẫu
  voice.json            metadata (label, modelDir, dryRun, ...)
  dry_run.json          chỉ có ở chế độ giả lập
```

Trên GPU, runner gọi luôn `finetune/make_voice.py --audio sample.wav --name <ten> --out model --default` để ghi embedding vào `voices_v3_turbo.json`.

Màn hình **Chuyển văn bản thành giọng nói** tự quét thư mục trên và thêm nhóm **"Giọng đã train [Custom Fine-tuned]"** vào dropdown chọn giọng. Khi chọn giọng này và bấm tạo audio, server Python khởi tạo:

```python
Vieneu(mode="v3turbo", backbone_repo="<modelDir>")
audio = tts.infer(text, voice="<ten>", ref_audio="<sample.wav>", use_ref_codes=False)
```

Nếu là model giả lập (dry-run trên máy không CUDA), app **hiện thông báo rõ ràng** và dừng lại — không crash, không tạo audio beep. Muốn đọc thật thì train lại trên máy có GPU NVIDIA rồi copy thư mục `./data/outputs/trained_voices/` sang.

