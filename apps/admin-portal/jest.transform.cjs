/* Minimal TS/TSX transformer for jest (sucrase): no Babel preset needed. */
const { transform } = require('sucrase');

module.exports = {
  process(source, filename) {
    const isTs = /\.tsx?$/.test(filename);
    if (!isTs) return { code: source };
    const transforms = filename.endsWith('x') ? ['typescript', 'jsx', 'imports'] : ['typescript', 'imports'];
    const { code } = transform(source, { transforms, jsxRuntime: 'automatic', production: true, filePath: filename });
    return { code };
  },
};
