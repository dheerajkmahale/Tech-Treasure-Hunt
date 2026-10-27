export const LEVELS = [
  { level: 1, title: 'The Cipher Crypt', subtitle: 'Decipher the Script', type: 'cipher', difficulty: 'Introductory' },
  { level: 2, title: 'The Broken Machine', subtitle: 'Repair What Was Corrupted', type: 'debugging', difficulty: 'Foundational' },
  { level: 3, title: 'Chamber of Riddles', subtitle: 'Think Like the Ancients', type: 'logic', difficulty: 'Intermediate' },
  { level: 4, title: 'Scam Sleuths', subtitle: 'Spot the Fraud', type: 'scam_awareness', difficulty: 'Advanced' },
  { level: 5, title: 'Crack the Logic', subtitle: 'Boolean Gates and Deduction', type: 'deduction', difficulty: 'Expert' }
];

// The approved question bank is imported separately from server/seeds/approved-question-bank.json:
// npm run questions:import --workspace server -- ./question-bank.json
export const challengeBank = [];
