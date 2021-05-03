import { model, Schema, Document } from 'mongoose';

const userSchema: Schema = new Schema({
    id: { required: true, type: Number }
}, { strict: false });

const UsersModel = model<any & Document>('Users', userSchema);
export default UsersModel;