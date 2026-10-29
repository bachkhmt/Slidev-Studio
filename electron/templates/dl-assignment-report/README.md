# Báo cáo Assignment Bách Khoa

Mẫu báo cáo A4 dựa trên `DL_Assignment_Template_minimal.zip` và PDF mẫu do người dùng cung cấp. Giữ bìa hai khung, logo Bách Khoa, mục lục, danh sách hình/bảng, section mẫu, bảng và hình mẫu.

Mẫu này dành cho dự án LaTeX đã có; wizard hiện ưu tiên **Báo cáo Markdown**. Để dùng source LaTeX, sao chép thư mục mẫu và chọn **Mở thư mục có sẵn** trong Slidev Studio. Sửa `main.tex` để điền môn học, mã môn, lớp, giảng viên, tên sinh viên và MSSV. Nội dung mẫu nằm trong `1-Sample Section.tex`.

- **Lưu & biên dịch**: lưu nguồn đang sửa và tạo PDF mới.
- **Biên dịch khi lưu**: tự cập nhật PDF sau khi lưu nội dung trong editor.
- **Xuất PDF**: biên dịch nội dung hiện tại rồi chọn nơi lưu PDF.
- **Cài bộ biên dịch**: tải Tectonic một lần vào dữ liệu của ứng dụng. Lần biên dịch đầu cần Internet để tải các gói LaTeX; gói đã tải được lưu trong cache.

`template-preview.pdf` chỉ là bản mẫu để tham khảo trước khi biên dịch. PDF của bạn được tạo trong `.studio-latex/`; nếu biên dịch lỗi, bản PDF thành công gần nhất vẫn được giữ.

Mẫu dùng font Times tương đương (TeX Gyre Termes) và hỗ trợ Unicode khi biên dịch bằng Tectonic/XeLaTeX. Đã thay gói `minted` không được dùng trong nội dung mẫu bằng cấu hình `listings` có sẵn, nên không cần shell escape. Nguồn pdfLaTeX vẫn có nhánh tương thích riêng.

Để thêm nội dung, tạo file `.tex` mới trong thư mục dự án rồi thêm `\include{tên-file}` vào trước `\end{document}` của `main.tex`; bấm làm mới cây file để mở file mới. Chép hình vào `image/` và thay `\missinggraphic` bằng `\includegraphics`.

Tectonic: <https://tectonic-typesetting.github.io/>. Bản runtime do Studio tải được ghim phiên bản và kiểm tra SHA-256; không tải hoặc chạy mã tùy ý từ nội dung báo cáo.
