const fs = require('fs');
const path = require('path');

// Fix test assertion patterns
function fixTestFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace toContain with stringContaining patterns
  content = content.replace(
    /expect\(([^)]+)\)\.toContain\(\s*expect\.stringContaining\('([^']+)'\)\s*\)/g,
    'expect($1.some(e => e.includes(\'$2\'))).toBe(true)'
  );
  
  // Replace toContain with stringContaining patterns (double quotes)
  content = content.replace(
    /expect\(([^)]+)\)\.toContain\(\s*expect\.stringContaining\("([^"]+)"\)\s*\)/g,
    'expect($1.some(e => e.includes("$2"))).toBe(true)'
  );
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed ${filePath}`);
}

// Fix specific test files
const testFiles = [
  'src/services/file-validation/file-validation.service.spec.ts',
  'src/services/data-extraction/data-extraction.service.spec.ts',
  'src/services/invoice-validation/invoice-validation.service.spec.ts',
  'src/services/duplicate-detection/duplicate-detection.service.spec.ts'
];

testFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    fixTestFile(fullPath);
  }
});

console.log('Test fixes applied');