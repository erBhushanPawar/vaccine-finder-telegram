import { model, Schema, Document } from 'mongoose';

const MsgsSchema: Schema = new Schema({
    msgId: { unique: true, required: true, type: String }
}, { strict: false });

const MsgsModel = model<any & Document>('Msgs', MsgsSchema);
export default MsgsModel;