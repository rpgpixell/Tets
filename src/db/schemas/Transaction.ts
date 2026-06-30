import mongoose, { Schema, Document } from 'mongoose';
import { Transaction } from '../../types/index';

interface ITransactionDocument extends Transaction, Document {
  _id: mongoose.Types.ObjectId;
}

const transactionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, default: '' },
    type: { type: String, enum: ['deposit', 'withdraw'], required: true },
    amount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    wallet: { type: String, default: '' },
    memo: { type: String, default: '' },
    createdAt: { type: Number, default: Date.now, index: true },
    approvedAt: { type: Number, default: null },
    rejectedAt: { type: Number, default: null },
    adminNote: { type: String, default: '' },
  },
  { collection: 'transactions' },
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

export const TransactionModel = mongoose.model<ITransactionDocument>(
  'Transaction',
  transactionSchema,
);
