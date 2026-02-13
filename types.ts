
export enum Sender {
  USER = 'user',
  JARVIS = 'jarvis',
}

export interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  timestamp: Date;
}
