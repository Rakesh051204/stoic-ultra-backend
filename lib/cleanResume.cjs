// Strip LaTeX markup so the AI reads clean resume text
function cleanResume(t = "") {
  return t
    .replace(/%.*$/gm, "")
    .replace(/\\(documentclass|usepackage|geometry|hypersetup|pagestyle|titleformat|setlength)\*?(\[[^\]]*\])?(\{[^}]*\})*/g, "")
    .replace(/\\(section|subsection|textbf|textit|underline|emph|href)\*?\{([^}]*)\}(\{([^}]*)\})?/g, "$2 $4")
    .replace(/\\(begin|end)\{[^}]*\}/g, "")
    .replace(/\\item/g, "- ")
    .replace(/\\\\/g, "\n")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
module.exports = { cleanResume };
