import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { QUALITY_CHECKLIST_45 } from '../src/checklist';
import { generateMarkdownReport, runCodeReview } from '../src/codeReviewEngine';
import { CONNECTOR_KNOWLEDGE } from '../src/connectorKnowledge';
import { extractFlows, maskXmlComments } from '../src/diagnostics';

async function runTests() {
  console.log('🧪 Starting MuleGuard End-to-End Test Suite...\n');

  // Test 1: Checklist integrity
  assert.strictEqual(QUALITY_CHECKLIST_45.length, 91, 'Checklist should have all quality rows defined');
  console.log('✅ Test 1: Quality Checklist loaded with 91 quality criteria across 13 sections.');

  // Test 2: Connector Knowledge Base
  const keys = Object.keys(CONNECTOR_KNOWLEDGE);
  assert.ok(keys.length >= 35, 'Knowledge base should contain at least 35 connectors');
  assert.ok(CONNECTOR_KNOWLEDGE['http:listener'], 'http:listener must be present');
  assert.ok(CONNECTOR_KNOWLEDGE['db:select'], 'db:select must be present');
  assert.ok(CONNECTOR_KNOWLEDGE['ee:transform'], 'ee:transform must be present');
  console.log(`✅ Test 2: Connector Knowledge Base contains ${keys.length} Mule connectors and processors.`);

  // Test 3: XML Flow extraction and comment masking
  const sampleXmlPath = path.resolve(__dirname, '../sample/mule-test-api.xml');
  assert.ok(fs.existsSync(sampleXmlPath), 'sample/mule-test-api.xml must exist');
  const sampleXml = fs.readFileSync(sampleXmlPath, 'utf8');
  const masked = maskXmlComments(sampleXml);
  const flows = extractFlows(masked);
  assert.strictEqual(flows.length, 2, 'Should extract 2 flows from sample file');
  assert.strictEqual(flows[0].name, 'create-order-flow');
  assert.strictEqual(flows[1].name, 'sync-orders-flow');
  console.log('✅ Test 3: XML parsing and flow extraction correctly located flows.');

  // Test 4: Code Review engine execution
  const projectRoot = path.resolve(__dirname, '..');
  const reviewResult = await runCodeReview(projectRoot);
  assert.ok(reviewResult.score >= 0 && reviewResult.score <= 100, 'Score should be between 0 and 100');
  assert.ok(reviewResult.findings.length > 0, 'Should find compliance items');
  console.log(`✅ Test 4: 7-Step Code Review audit passed! Score: ${reviewResult.score}/100, Findings: ${reviewResult.totalFindings}`);

  // Test 5: Report Markdown Generation
  const markdown = generateMarkdownReport(reviewResult);
  assert.ok(markdown.includes('# MuleGuard Code Review Report'), 'Report should have correct heading');
  assert.ok(markdown.includes('Executive Summary'), 'Report should have executive summary');
  console.log('✅ Test 5: Markdown report generated cleanly.');

  console.log('\n🎉 ALL 5 TEST SUITES PASSED CLEANLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
