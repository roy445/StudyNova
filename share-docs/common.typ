#set page(paper: "a4", margin: (x: 18mm, y: 17mm), numbering: "1")
#set text(font: ("Noto Sans CJK TC", "Noto Sans CJK SC", "Noto Sans"), size: 10pt, lang: "zh")
#set par(leading: 0.78em, spacing: 0.7em, justify: true)
#set heading(numbering: "1.")
#show heading.where(level: 1): it => { pagebreak(weak: true); text(size: 17pt, weight: "bold", fill: rgb("123b63"))[#it] }
#show heading.where(level: 2): it => text(size: 12.5pt, weight: "bold", fill: rgb("176b87"))[#it]
#show link: set text(fill: rgb("176b87"))
#let title-page(title, subtitle, edition) = {
  align(center + horizon)[
    #rect(width: 100%, inset: 18pt, radius: 10pt, fill: gradient.linear(rgb("071b36"), rgb("123b63")), stroke: 1pt + rgb("ffc857"))[
      #v(20pt)
      #image("../public/brand/studynova-logo-horizontal.webp", width: 240pt)
      #v(14pt)
      #image("../public/brand/studynova-logo-square-192.png", width: 74pt, height: 74pt)
      #v(14pt)
      #text(size: 28pt, weight: "bold", fill: white)[StudyNova AI]
      #v(16pt)
      #text(size: 22pt, weight: "bold", fill: rgb("ffe7ad"))[#title]
      #v(8pt)
      #text(size: 12pt, fill: rgb("d9efff"))[#subtitle]
      #v(22pt)
      #text(size: 10pt, fill: rgb("b8d6ed"))[#edition]
      #v(20pt)
    ]
  ]
  pagebreak()
}
#let note(body) = rect(width: 100%, inset: 9pt, radius: 5pt, fill: rgb("eaf7fb"), stroke: 0.7pt + rgb("65bfd7"))[#body]
#let warning(body) = rect(width: 100%, inset: 9pt, radius: 5pt, fill: rgb("fff6df"), stroke: 0.7pt + rgb("e3ad3c"))[#body]
#let small(body) = text(size: 8.5pt, fill: rgb("536779"))[#body]
#show: doc => { doc; v(12pt); line(length: 100%, stroke: 0.4pt + rgb("cbd8e4")); align(center)[small[StudyNova AI｜© 2026 StudyNova AI｜版權所有｜請以網站當前版本為準]] }
