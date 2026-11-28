# Hướng dẫn chạy dự án trên máy có GPU NVIDIA

Mục tiêu: mang toàn bộ source sang máy GPU, cài môi trường, chạy app và dùng giọng **Fine-tuned** thật.

> Toàn bộ đường dẫn trong code là **tương đối** (`./data`, `./data/vieneu-src`, `./data/outputs/...`).
> Bạn chỉ cần copy cả thư mục dự án sang máy GPU — không sửa code, không hardcode path máy.

---

## 0. Yêu cầu

- Windows 10/11 64-bit, NVIDIA driver mới nhất
- Python **3.10+** (khuyến nghị 3.12)
- Node.js **22+**
- Git

Kiểm tra GPU:

```powershell
nvidia-smi
```

---

## 1. Vào thư mục dự án & tạo môi trường ảo

Giả sử bạn copy dự án vào `<duong-dan-du-an>` (đổi tên nếu cần):

```powershell
cd <duong-dan-du-an>
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
```

> Mỗi lần mở terminal mới, chạy lại lệnh `.\.venv\Scripts\activate`.

---

## 2. Cài PyTorch bản CUDA (bắt buộc trước requirements)

Chọn **một** trong hai lệnh theo driver CUDA của bạn (`nvidia-smi` → CUDA Version):

```powershell
# CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Hoặc CUDA 12.4
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```

Kiểm tra:

```powershell
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Phải in `True` và tên GPU. Nếu `False` → app sẽ tự chạy **dry-run**, không train thật.

---

## 3. Cài dependencies của app

```powershell
pip install -r requirements.txt
```

`requirements.txt` đã gồm: `vieneu`, `faster-whisper`, `av`, `soundfile`, `fastapi`, `uvicorn`,
`peft`, `transformers`, `datasets`, `pyarrow`, `accelerate`, `unsloth`...

> Nếu `unsloth` báo xung đột phiên bản `torch`/`transformers`, mở `requirements.txt` và comment dòng `unsloth` rồi cài lại — pipeline chính thức vẫn chạy với `peft + transformers + accelerate`.

---

## 4. Tải mã huấn luyện chính thức của VieNeu-TTS

App gọi 3 script `prepare_dataset.py`, `train_lora.py`, `merge_lora.py` từ repo này.
Clone vào đúng đường dẫn mặc định `./data/vieneu-src` (để ô "Repo VieNeu-TTS" trong UI khỏi sửa):

```powershell
git clone https://github.com/pnnbao97/VieNeu-TTS.git data/vieneu-src
pip install -e data/vieneu-src
```

Cấu trúc mong đợi:

```
data/
  vieneu-src/
    finetune/
      prepare_dataset.py
      train_lora.py
      merge_lora.py
      make_voice.py
    src/
```

Lần đầu chạy, model backbone sẽ tự tải qua Hugging Face (cần internet).

---

## 5. Chạy app (2 terminal)

### Terminal 1 — Web (Next.js)

```powershell
cd <duong-dan-du-an>
npm install
$env:DATA_DIR = "./data"
$env:SESSION_SECRET = "thay-bang-chuoi-ngau-nhien-dai"
npm run dev
```

Mở trình duyệt: **http://localhost:3000** — đăng nhập `admin` / `admin123`.

### Terminal 2 — Server giọng Python (chạy TTS + train)

```powershell
cd <duong-dan-du-an>
.\.venv\Scripts\activate
$env:PYTHONPATH = ".\data\vieneu-src\src;.\data\vieneu-src\finetune"
python -u vieneu-server/server.py
```

Server chạy ở `http://127.0.0.1:8000`.

---

## 6. Luồng sử dụng trên máy GPU

1. Vào **🧠 Huấn luyện giọng (Fine-tuning)** → upload audio → **Cắt đoạn & Nhận diện**.
2. Nghe thử / sửa text → **💾 Lưu thay đổi**.
3. Khu vực **⚙️ Huấn luyện LoRA**: giữ mặc định `epochs 3`, `batch 4`, `lr 0.0002`,
   ô **Repo VieNeu-TTS** = `./vieneu-src` → bấm **🚀 Bắt đầu huấn luyện**.
   - Badge sẽ hiện **GPU CUDA** (thay vì DRY-RUN).
   - Log chạy lần lượt: `prepare_dataset.py` → `train_lora.py` → `merge_lora.py` → `make_voice.py`.
4. Sau khi xong, giọng tự đóng gói tại:

   ```
   ./data/outputs/trained_voices/<ten_giong>/
     model/          model đã merge + voices_v3_turbo.json
     sample.wav      clip mẫu 5–8s
     transcript.txt  transcript clip mẫu
     voice.json      metadata
   ```

5. Về màn hình **Chuyển văn bản thành giọng nói** → dropdown **Giọng đã train [Custom Fine-tuned]** → chọn giọng vừa train → dán text → **Tạo giọng nói**.

---

## 7. Chạy bản production (tuỳ chọn)

```powershell
cd <duong-dan-du-an>
npm run build
xcopy .next\static .next\standalone\.next\static /E /I /Y

$env:DATA_DIR = "./data"
$env:SESSION_SECRET = "thay-bang-chuoi-ngau-nhien-dai"
$env:HOSTNAME = "127.0.0.1"
$env:PORT = "3000"
node .next/standalone/server.js
```

Terminal 2 vẫn chạy server Python như mục 5.

---

## 8. Xử lý sự cố nhanh

| Triệu chứng | Cách sửa |
|---|---|
| Badge vẫn là **DRY-RUN** | `python -c "import torch; print(torch.cuda.is_available())"` phải là `True` |
| `Không tìm thấy script chính thức...` | Đã clone repo vào `data/vieneu-src` chưa? Kiểm tra 3 file trong `finetune/` |
| `Chưa có faster-whisper` | `pip install -r requirements.txt` trong venv đang activate |
| Port 3000 bị chiếm | Đóng terminal cũ hoặc đổi `$env:PORT` rồi mở URL tương ứng |
| Model tải rất lâu lần đầu | Internet + dung lượng ổ cứng (vài GB cho backbone/tokenizer) |
| Muốn mang giọng từ máy cũ sang | Copy nguyên thư mục `data/outputs/trained_voices/` sang máy GPU |

---

## 9. Các đường dẫn tương đối dùng trong code (tham khảo)

| Mục đích | Đường dẫn |
|---|---|
| DB, audio, model cache | `./data/` (biến `DATA_DIR`) |
| Dataset huấn luyện | `./data/datasets/<ten_giong>/` |
| Repo VieNeu-TTS | `./data/vieneu-src/` |
| Giọng đã đóng gói | `./data/outputs/trained_voices/<ten_giong>/` |
| Model whisper tải về | `./data/models/whisper/` |

Không có đường dẫn tuyệt đối nào được hardcode trong source — bạn có thể đổi tên thư mục dự án tuỳ ý.
