import mongoose, { Schema, Document } from 'mongoose';
import { UserDocument } from '../../types/index';

interface IUserDocument extends UserDocument, Document {
  _id: mongoose.Types.ObjectId;
}

const userSchema = new Schema(
  {
    tgId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    charId: { type: String, default: null, index: true },
    data: { type: Schema.Types.Mixed, default: null },
    level: { type: Number, default: 1, index: true },
    cp: { type: Number, default: 0, index: true },
    floor: { type: Number, default: 1 },
    updatedAt: { type: Number, default: 0, index: true },
    refClaimVer: { type: Number, default: 0 },
    refBy: { type: String, default: null, index: true },
    refMilestones: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { minimize: false, collection: 'saves' },
);

// Compound indexes for common queries
userSchema.index({ cp: -1, level: -1 });
userSchema.index({ charId: { $ne: null } });

export const User = mongoose.model<IUserDocument>('Save', userSchema);
