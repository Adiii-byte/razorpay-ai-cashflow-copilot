import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Razorpay from 'razorpay';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Razorpay test credentials (optional fallback to mock if keys not present)
const rzpKeyId = process.env.RAZORPAY_KEY_ID || '';
const rzpSecret = process.env.RAZORPAY_KEY_SECRET || '';
let rzp = null;

if (rzpKeyId && rzpSecret) {
  rzp = new Razorpay({ key_id: rzpKeyId, key_secret: rzpSecret });
}

let transactions = [
  { id: 'pay_001', customer: 'Alpha Retailers', amount: 32000, status: 'captured', date: '2026-03-01', phone: '+919876543210' },
  { id: 'pay_002', customer: 'QuickMart Logistics', amount: 14500, status: 'captured', date: '2026-03-02', phone: '+919876543211' },
  { id: 'pay_003', customer: 'Studio Zen Designs', amount: 18400, status: 'failed', attempts: 3, date: '2026-03-03', phone: '+919876543212' },
  { id: 'pay_004', customer: 'Metro Distributors', amount: 9600, status: 'pending', date: '2026-03-04', phone: '+919876543213' },
  { id: 'pay_005', customer: 'Apex Cloud Systems', amount: 7500, status: 'failed', attempts: 2, date: '2026-03-05', phone: '+919876543214' }
];

const outflows = [
  { title: 'Warehouse Rent', amount: 45000, dueDay: 10 },
  { title: 'Server Infrastructure', amount: 16000, dueDay: 12 },
  { title: 'Vendor Logistics', amount: 22000, dueDay: 14 }
];

function getMetrics() {
  const captured = transactions.filter(t => t.status === 'captured').reduce((s, t) => s + t.amount, 0);
  const failed = transactions.filter(t => t.status === 'failed').reduce((s, t) => s + t.amount, 0);
  const pending = transactions.filter(t => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const totalOutflow = outflows.reduce((s, o) => s + o.amount, 0);

  const expectedInflow = Math.round(captured * 0.4 + pending * 0.7);
  const shortfall = Math.max(0, totalOutflow - expectedInflow);
  const healthScore = shortfall > 15000 ? 54 : shortfall > 0 ? 71 : 94;
  const riskLevel = shortfall > 15000 ? 'HIGH' : shortfall > 0 ? 'MODERATE' : 'HEALTHY';

  return { captured, failed, pending, totalOutflow, expectedInflow, shortfall, healthScore, riskLevel };
}

// 1. Fetch Dashboard State
app.get('/api/dashboard', async (req, res) => {
  if (rzp) {
    try {
      const live = await rzp.payments.all({ count: 10 });
      if (live.items?.length > 0) {
        const liveMapped = live.items.map(p => ({
          id: p.id,
          customer: p.contact || p.email || 'Customer',
          amount: p.amount / 100,
          status: p.status === 'captured' ? 'captured' : 'failed',
          date: new Date(p.created_at * 1000).toISOString().split('T')[0],
          phone: p.contact || '+919999999999'
        }));
        transactions = liveMapped;
      }
    } catch (err) {
      console.log('Live Razorpay fetch skipped, using mock baseline.');
    }
  }
  res.json({
    metrics: getMetrics(),
    transactions,
    outflows,
    atRisk: transactions.filter(t => t.status === 'failed' || t.status === 'pending')
  });
});

// 2. AI Reasoning / Analysis Copilot
app.post('/api/copilot', (req, res) => {
  const { question } = req.body;
  const m = getMetrics();
  const q = (question || '').toLowerCase();

  let reply = '';
  if (q.includes('enough') || q.includes('15 days') || q.includes('cash') || q.includes('runway')) {
    reply = `⚠️ ${m.riskLevel} Cashflow Risk Detected.
• Expected Inflows (15d): ₹${m.expectedInflow.toLocaleString('en-IN')}
• Committed Outflows: ₹${m.totalOutflow.toLocaleString('en-IN')}
• Net Shortfall: ₹${m.shortfall.toLocaleString('en-IN')}

Diagnosis: Rent and cloud hosting dues on Days 10–12 will trigger a deficit unless ₹${(m.failed + m.pending).toLocaleString('en-IN')} pending from overdue clients is recovered.`;
  } else if (q.includes('follow') || q.includes('who') || q.includes('attention') || q.includes('customer')) {
    const debtors = transactions.filter(t => t.status === 'failed' || t.status === 'pending');
    const list = debtors.map(d => `• ${d.customer}: ₹${d.amount.toLocaleString('en-IN')} (${d.status === 'failed' ? 'Failed repeated charge' : 'Invoice overdue'})`).join('\n');
    reply = `Action Priority Accounts:\n${list}\n\nRecommended Action: Dispatch WhatsApp recovery links immediately.`;
  } else {
    reply = `Financial Summary:
Current Inflow: ₹${m.captured.toLocaleString('en-IN')}
Overdue/Failed Pipeline: ₹${(m.failed + m.pending).toLocaleString('en-IN')}
Health Score: ${m.healthScore}/100.
Recommendation: Prioritize collections before clearing discretionary expenses.`;
  }

  res.json({ reply });
});

// 3. AI Smart Recovery Draft
app.post('/api/recovery/draft', (req, res) => {
  const { customer, amount, phone } = req.body;
  const message = `Namaste ${customer}, your payment of ₹${Number(amount).toLocaleString('en-IN')} is currently overdue. Please clear it securely via your Razorpay Link: https://rzp.io/i/demo_${Date.now().toString().slice(-4)}. Thank you!`;
  res.json({ message, phone });
});

// 4. Razorpay Webhook Simulator (Demo Feature)
app.post('/api/simulator', (req, res) => {
  const { type, amount, customer } = req.body;
  const item = {
    id: `pay_sim_${Date.now()}`,
    customer: customer || 'New Direct Client',
    amount: Number(amount) || 12000,
    status: type === 'captured' ? 'captured' : 'failed',
    attempts: type === 'captured' ? 1 : 2,
    date: new Date().toISOString().split('T')[0],
    phone: '+919988776655'
  };
  transactions.unshift(item);
  res.json({ success: true, item, metrics: getMetrics() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n Project running live at: http://localhost:${PORT}`);
});