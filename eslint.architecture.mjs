import path from "node:path";
const rule = {
  meta: { type: "problem", schema: [], messages: { boundary: "Dependencia prohibida por la arquitectura: {{target}}." } },
  create(context) {
    const file = context.filename.replaceAll("\\", "/");
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return {};
    const client = context.sourceCode.ast.body.some(n => n.type === "ExpressionStatement" && n.directive === "use client");
    function check(node, source) {
      if (typeof source !== "string") return;
      const resolved = source.startsWith("@/") ? path.resolve("src", source.slice(2)) : source.startsWith(".") ? path.resolve(path.dirname(file), source) : source;
      const target = resolved.replaceAll("\\", "/");
      const domain = file.includes("/src/domain/"), application = file.includes("/src/application/");
      const forbidden = domain && (/\/src\/(application|infrastructure|app|features)\//.test(target) || /^(next(?:\/|$)|node:(fs|http|https|net)|@simplewebauthn)/.test(source))
        || application && (/\/src\/(infrastructure|app|features)\//.test(target) || /^next(?:\/|$)/.test(source))
        || client && (/\/src\/infrastructure\//.test(target) || source.startsWith("node:") || source === "@simplewebauthn/server");
      if (forbidden) context.report({ node, messageId: "boundary", data: { target: source } });
    }
    return {
      ImportDeclaration: n => check(n, n.source.value),
      ExportNamedDeclaration: n => check(n, n.source?.value),
      ExportAllDeclaration: n => check(n, n.source.value),
      ImportExpression: n => check(n, n.source.value),
      CallExpression: n => { if (n.callee.type === "Identifier" && n.callee.name === "require") check(n, n.arguments[0]?.value); },
    };
  },
};
const architecture = { rules: { boundaries: rule } };
export default architecture;
