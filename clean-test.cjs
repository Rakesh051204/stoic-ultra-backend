const { cleanResume } = require('./lib/cleanResume.cjs');
const s = String.raw`\section{Projects} \textbf{Stoic} \begin{itemize} \item Built RAG app \end{itemize}`;
console.log(cleanResume(s));
