# Báo cáo Assignment Bách Khoa - Markdown

Sửa `main.md` rồi lưu. App tự tạo preview PDF A4 bằng Electron, không cần TeX, Tectonic, npm hoặc bộ biên dịch bên ngoài.

Phần YAML đầu file chứa thông tin bìa: title, assignment, course, courseCode, topic, class, supervisor, students, date. Giữ hai dòng `---` bao quanh phần này.

- `#`, `##`, `###`: section, subsection, subsubsection; được đánh số tự động và đưa vào mục lục.
- Bảng dùng cú pháp bảng Markdown. Viết một dòng `Table: Tên bảng` ngay trước bảng để thêm caption và danh sách bảng.
- `![Tên hình](image/ten-hinh.png)` tạo hình có caption và đưa vào danh sách hình. Ảnh phải nằm trong thư mục dự án.
- Công thức: `$x^2$` trong dòng hoặc khối `$$` ở hai dòng riêng.
- Một dòng `---` trong nội dung bắt đầu trang mới. Nội dung dài được phân trang tự động; bảng dài lặp lại hàng tiêu đề.

App tạo bìa, mục lục và danh sách hình/bảng trước phần nội dung. Nút **Lưu & cập nhật PDF** cập nhật ngay; **Xuất PDF** lưu nội dung hiện tại rồi mở hộp thoại chọn nơi xuất. File tạm nằm trong `.studio-report/`.

Bố cục dùng HTML/CSS A4 để giữ phong cách của mẫu báo cáo gốc; cách ngắt dòng và dàn bảng có thể khác LaTeX.
