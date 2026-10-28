import api from '../ipc-client'
import { DocumentStore } from './documentStore'
export const documents = new DocumentStore(api.fs)
