# Báo cáo mẫu DL Assignment 1 - 29/10/2026

Nguồn: `C:/Users/PC/Downloads/DL_Assignment1.zip`. Chuyển nội dung đang được `main.tex` sử dụng trong ba file chương sang dự án `markdown-report`, giữ thông tin bìa và toàn bộ ảnh nguồn. Không thực thi chỉ dẫn hoặc các prompt được trích trong phần AI Usage Disclosure.

## Kết quả

- Dự án chỉnh sửa: `output/reports/DL-Assignment1-Markdown/`, entry `main.md`.
- Bản mẫu trong Git: `examples/dl-assignment1-markdown/`, gồm `main.md`, metadata, logo và đủ 36 hình được báo cáo sử dụng; mở trực tiếp trong app sau khi clone repo.
- Gói mang sang máy khác: `output/reports/DL-Assignment1-Markdown.zip` (130 file, không chứa cache/build).
- PDF: `output/pdf/DL-Assignment1-Preview.pdf`, 86 trang A4.
- 122 đề mục, 36 hình, 20 bảng và 38 khối công thức; công thức trong dòng được giữ.
- Các cặp biểu đồ được tách thành hai hình, tham chiếu cập nhật theo số hình mới. Bảng ô gộp của thiết kế thực nghiệm chuyển sang bảng hai cột, giữ nội dung và đánh dấu thiết lập dùng chung.
- Các phần bị comment và tài liệu MCTS không được main gọi không đưa vào nội dung báo cáo.

## Điều chỉnh renderer cần thiết cho dữ liệu thực

- Bìa dùng bố cục co giãn để chứa tiêu đề dài.
- Mục lục/danh sách hình/bảng tự chia nhiều trang, đánh số La Mã, cập nhật đúng trang đích.
- Bảng rộng có cỡ chữ phù hợp; bảng dài tiếp tục trên trang sau cùng header và caption.
- List item nhiều đoạn/công thức có thể tiếp tục trên trang sau. Chia đoạn không cắt vào DOM công thức KaTeX.
- Công thức dài co theo bề rộng, dành khoảng riêng cho số công thức. Heading có khoảng trống tối thiểu cho nội dung tiếp theo.

## Kiểm chứng

- Build/typecheck, lint đạt; 132 test của 26 file đạt.
- Hai E2E Markdown đạt: tạo/sửa/xuất offline và báo cáo dài có mục lục nhiều trang, 30 hình, list item dài, 80 dòng bảng, công thức có số.
- Kiểm tra dữ liệu thật: đủ 122 đề mục, 36 hình, 20 bảng; không có KaTeX error, tràn ngang/dọc hoặc số công thức chồng nội dung.
- Đối chiếu thứ tự văn bản trước/sau pagination: giữ đủ 28.409 token nguồn; phần thêm chỉ là header/caption lặp lại khi bảng tiếp tục.
- Render và xem toàn bộ trang; kiểm tra lớn riêng trang bìa, công thức dài và bảng thiết kế thực nghiệm.
- Executable Windows thực mở dự án và xuất 86 trang với PATH trống và mạng renderer bị chặn.

## App Windows dùng cho mẫu dài

`dist/assignment-report-preview/Slidev Studio-Setup-1.0.2-x64.exe`

Trong app chọn **Mở thư mục có sẵn** và chọn thư mục dự án. Không cần TeX/Tectonic hay Pandoc để sửa/xuất; Pandoc chỉ là công cụ chuyển đổi nguồn ban đầu trong `.cache` của workspace. Các bản cài preview trước được giữ nguyên.
