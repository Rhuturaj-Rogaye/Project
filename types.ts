
export enum AppState {
  SETUP,
  ANALYZING,
  GENERATING,
  TAKING_QUIZ,
  REVIEW,
}

export interface Answer {
  text: string;
  isCorrect: boolean;
  feedback: string;
}

export interface QuizQuestion {
  question: string;
  answers: Answer[];
  source: {
    title: string;
    url: string;
  };
}

export interface UserAnswer {
  questionIndex: number;
  answerIndex: number;
}
