# HCMUT-Bach Slidev Theme

This source folder contains a Slidev project template. The local theme lives in `theme/`, and the project deck is `slides.md`.

Theme Slidev chuyển thể từ template Beamer `SudaBeamer.sty`, với tông xanh HCMUT, thanh điều hướng section/mini-frame và footer hai màu. Theme mặc định khổ 4:3 như Beamer; deck có thể chuyển sang 16:9 bằng frontmatter.

## Chạy starter

```bash
cd starter
npm install
npm run dev
```

The generated project points to the bundled theme with `theme: ./theme`.

## Dùng theme trong deck khác

Trỏ `theme` tới thư mục theme bằng đường dẫn tương đối hoặc tuyệt đối:

```yaml
---
theme: /đường/dẫn/tới/hcmut-bach
aspectRatio: 4/3
fonts:
  provider: none
  sans: Source Sans 3
  mono: JetBrains Mono
title: Tên bài trình bày
shortTitle: Tên rút gọn ở footer
authors:
  - Nguyễn Văn A
  - Trần Thị B
advisor: PGS. TS. Nguyễn Văn C
institute: Trường Đại học Bách khoa, ĐHQG-HCM
date: 29/09/2026
logo: /images/logo-khoa.png
---
```

Ảnh `logo` tùy chỉnh nên đặt trong thư mục `public/` của deck và dùng URL bắt đầu bằng `/`. Bỏ `logo` để dùng logo HCMUT đi kèm theme; đặt `logo: false` để ẩn logo. `authors` nhận danh sách tên; nếu không khai báo, theme dùng `author`. `advisor` chỉ hiện trên trang bìa.

Để dùng khổ 16:9, đặt `aspectRatio: 16/9`. Đặt `background: false` để tắt ảnh nền trong toàn deck; layout `full` mặc định không có khung và nền.

## Frontmatter mỗi slide

| Thuộc tính | Giá trị | Ý nghĩa |
|---|---|---|
| `size` | `xs`, `sm`, `md` hoặc số px | Cỡ chữ slide; mặc định `md` (21px). Dùng `xs`/`sm` để chỉnh slide dày nội dung. |
| `subtitle` | Chuỗi | Dòng phụ dưới tiêu đề slide, tương đương `\framesubtitle`. |
| `align` | `top` hoặc `center` | Căn nội dung sát trên hoặc căn giữa theo chiều dọc. |
| `toc` | `show`, `shaded`, `hide` | Hiện toàn bộ mục lục, làm mờ section khác, hoặc ẩn mục lục. |
| `ratio` | `1:1`, `1:2`, `2:1` | Tỷ lệ cột cho layout `two-cols`. |
| `background` | `false` | Tắt ảnh nền ở slide đó. |

Section được khai báo bằng một slide `layout: section`. `short` là tên rút gọn cho nav; `sub` là dòng phụ ở mục lục. Nav mini-frame có một chấm cho mỗi slide đến section tiếp theo; chấm của slide hiện tại được tô đậm.

```yaml
---
layout: section
title: Phương pháp đề xuất
short: Phương pháp
sub: Structural prior
---
```

## Layout

| Layout | Dùng cho |
|---|---|
| `cover` | Trang bìa, có section bar và metadata tác giả/đơn vị. |
| `agenda` | Mục lục toàn deck. |
| `section` | Slide mở đầu section, mục hiện tại được nhấn. |
| `default` | Slide nội dung; `#` là tiêu đề, hỗ trợ `subtitle`, `align`, `size`. |
| `two-cols` | Hai cột; dùng slot `::left::` và `::right::`, hỗ trợ `ratio`. |
| `end` | Trang cảm ơn/Q&A có khung HCMUT. |
| `full` | Hình hoặc nội dung lớn toàn slide, không có thanh đầu/cuối. |

## Components

```md
<Block title="Mục tiêu chung">Nội dung thường.</Block>
<Block type="alert" title="Vấn đề đặt ra">Tiêu đề đỏ, không có nền màu.</Block>
<Block type="example" title="Ví dụ">Khối ví dụ.</Block>

<Figure src="/images/pipeline.png" n="1" caption="Pipeline của phương pháp." />
<Figure n="2" caption="Placeholder hiện khi chưa có ảnh." />

<ReferenceItem n="1">Tên tác giả. Tên công trình. Tạp chí, năm.</ReferenceItem>
```

`Figure` giới hạn ảnh ở 70% chiều cao khung và hiện `Image not supplied` khi thiếu ảnh hoặc tải ảnh thất bại. Đánh số hình thủ công bằng `n`. Số công thức dùng `\tag{1}` trong công thức KaTeX; có thể viết `\cmd{section}` và `\env{align}` để định dạng lệnh/môi trường LaTeX.

Để tùy chỉnh cột bảng, dùng HTML `<table class="hb-table">` và `<colgroup>` với `style="width:..."`; `hb-table--compact` thu nhỏ chữ và `hb-table--wide` nới bảng ra sát lề nội dung.

Bullet dùng `<v-clicks>` như thường lệ; pseudo-bullet của theme ẩn/hiện cùng phần tử `<li>`.

## Overflow và kiểm chứng

Trong dev, nội dung tràn vùng trước footer được viền đỏ và hiện số pixel tràn. Cảnh báo ẩn trong chế độ print/export. Theme không tự co chữ; chỉnh slide bằng `size: xs`/`sm` hoặc chia nội dung.

```bash
node ../scripts/check-overflow.mjs --project .
python3 ../scripts/compare.py --beamer-pdf /path/to/beamer.pdf --project . --entry slides.md
```

`compare.py` cần `pdftoppm` và Pillow. Các script nhận đường dẫn baseline làm tham số; repo không chứa `slides.tex`, PDF Beamer hay ảnh `pipeline.png`/`prior_map.png`, nên báo cáo 38 trang chỉ hoàn tất khi có các tệp tham chiếu đó.

## Offline và phiên bản

Source Sans 3 và JetBrains Mono được bundle dạng WOFF2 gồm subset Latin và Latin Extended (bao gồm tiếng Việt); `fonts.provider: none` ngăn Slidev tải Google Fonts. Font được phân phối theo SIL Open Font License, bản license nằm trong `assets/fonts/`.

Source theme ghim `@slidev/cli` ở `53.0.0` vì theme đọc headmatter qua `configs` và nav qua `useNav`. Repo hiện để ở chế độ private và `package.json` có `private: true`, nên không publish npm từ repo này.

`npm install` cũng áp dụng patch tương thích cho `@shikijs/vitepress-twoslash@4.4.3`: FloatingVue hiện không còn expose component nội bộ mà plugin cố sửa để chặn tooltip khi kéo chọn chữ. Patch kiểm tra API trước khi áp dụng workaround, tránh lỗi console mà vẫn cài FloatingVue bình thường.

## Chuyển đổi từ Beamer

- `\framesubtitle` → `subtitle:`; `[t]` → `align: top`; `\fontsize` → `size:`.
- `\section{...}` → slide `layout: section` với `title:` và `short:`.
- `alertblock`, `block`, `exampleblock` → component `<Block>` tương ứng.
- `\pause` → `v-click` trên nội dung cần hiện theo bước.
- Công thức `\tag{n}` và số hình `n` được ghi tay để thứ tự ổn định giữa các slide.
