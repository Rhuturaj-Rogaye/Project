
import React, { useState, useCallback, useMemo } from 'react';
import { AppState, QuizQuestion, Answer, UserAnswer } from './types';
import { extractTopicsFromGuide, generateQuizQuestions } from './services/geminiService';

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

// --- SVG Icons ---
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
);

const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// --- UI Components defined within App.tsx to keep file count low ---

interface CardProps {
    children: React.ReactNode;
    className?: string;
}
const Card: React.FC<CardProps> = ({ children, className = '' }) => (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-6 md:p-8 ${className}`}>
        {children}
    </div>
);


const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.SETUP);
    const [file, setFile] = useState<File | null>(null);
    const [fileData, setFileData] = useState<{ base64: string; mimeType: string } | null>(null);
    const [topics, setTopics] = useState<string[]>([]);
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
    const [questionCount, setQuestionCount] = useState<number>(10);
    const [quizData, setQuizData] = useState<QuizQuestion[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
    const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setError(null);
            setTopics([]);
            setSelectedTopics([]);
            setFile(selectedFile);
            setAppState(AppState.ANALYZING);
            setLoadingMessage('Analyzing your exam guide...');
            try {
                const base64 = await fileToBase64(selectedFile);
                setFileData({ base64, mimeType: selectedFile.type });
                const extractedTopics = await extractTopicsFromGuide(base64, selectedFile.type);
                if (extractedTopics.length === 0) {
                   setError("Could not find any topics in the document. Please try a different file.");
                   setAppState(AppState.SETUP);
                   setFile(null);
                   setFileData(null);
                } else {
                  setTopics(extractedTopics);
                  setSelectedTopics(extractedTopics); // Select all by default
                  setAppState(AppState.SETUP);
                }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during analysis.";
                setError(errorMessage);
                setFile(null);
                setFileData(null);
                setAppState(AppState.SETUP);
            }
        }
    };
    
    const handleTopicToggle = (topic: string) => {
        setSelectedTopics(prev => 
            prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
        );
    };

    const handleGenerateQuiz = async () => {
      if (!fileData || selectedTopics.length === 0) {
        setError("Please upload a guide and select at least one topic.");
        return;
      }
      setError(null);
      setAppState(AppState.GENERATING);
      setLoadingMessage('Generating your custom quiz... This may take a moment.');
      try {
        const questions = await generateQuizQuestions(fileData.base64, fileData.mimeType, selectedTopics, questionCount);
        const randomizedQuestions = shuffleArray(questions).map(q => ({
          ...q,
          answers: shuffleArray(q.answers)
        }));
        setQuizData(randomizedQuestions);
        setCurrentQuestionIndex(0);
        setUserAnswers([]);
        setAppState(AppState.TAKING_QUIZ);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to generate quiz.";
        setError(errorMessage);
        setAppState(AppState.SETUP);
      }
    };

    const handleAnswerSelect = (questionIndex: number, answerIndex: number) => {
      setUserAnswers(prev => {
        const existing = prev.find(a => a.questionIndex === questionIndex);
        if (existing) {
          return prev.map(a => a.questionIndex === questionIndex ? { ...a, answerIndex } : a);
        }
        return [...prev, { questionIndex, answerIndex }];
      });
    };

    const handleNextQuestion = () => {
      if (currentQuestionIndex < quizData.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        setAppState(AppState.REVIEW);
      }
    };

    const handleStartOver = () => {
      setAppState(AppState.SETUP);
      setFile(null);
      setFileData(null);
      setTopics([]);
      setSelectedTopics([]);
      setQuizData([]);
      setUserAnswers([]);
      setError(null);
    };
    
    const score = useMemo(() => {
        return userAnswers.reduce((correctCount, userAnswer) => {
            const question = quizData[userAnswer.questionIndex];
            const answer = question.answers[userAnswer.answerIndex];
            return answer.isCorrect ? correctCount + 1 : correctCount;
        }, 0);
    }, [userAnswers, quizData]);

    const renderSetup = () => (
        <Card>
            <h2 className="text-3xl font-bold text-center text-white mb-2">Dynamic Quiz Generator</h2>
            <p className="text-center text-gray-400 mb-8">Upload an exam guide to generate a custom practice quiz.</p>

            {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-md mb-6">{error}</div>}

            <div className="space-y-6">
                <div>
                    <label className="block text-lg font-semibold mb-2 text-gray-300">1. Upload Exam Guide</label>
                    <div className="flex items-center justify-center w-full">
                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700 hover:bg-gray-600 transition-colors">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadIcon />
                                {file ? (
                                    <>
                                        <p className="mb-2 text-sm text-green-400 font-semibold">{file.name}</p>
                                        <p className="text-xs text-gray-400">Choose a different file to start over</p>
                                    </>
                                ) : (
                                     <>
                                        <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                        <p className="text-xs text-gray-400">PDF, DOCX, or TXT</p>
                                    </>
                                )}
                            </div>
                            <input id="dropzone-file" type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileChange} />
                        </label>
                    </div>
                </div>

                {topics.length > 0 && (
                    <>
                        <div>
                            <label className="block text-lg font-semibold mb-2 text-gray-300">2. Select Topics</label>
                            <div className="max-h-60 overflow-y-auto bg-gray-900/50 p-4 rounded-md border border-gray-700 space-y-2">
                                {topics.map(topic => (
                                    <div key={topic} onClick={() => handleTopicToggle(topic)} className="flex items-center p-2 rounded-md hover:bg-gray-700 cursor-pointer transition-colors">
                                        <div className={`w-5 h-5 mr-3 flex-shrink-0 rounded border-2 ${selectedTopics.includes(topic) ? 'bg-blue-600 border-blue-500' : 'bg-gray-600 border-gray-500'} flex items-center justify-center`}>
                                            {selectedTopics.includes(topic) && <CheckIcon />}
                                        </div>
                                        <span className="text-gray-200">{topic}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="question-count" className="block text-lg font-semibold mb-2 text-gray-300">3. Number of Questions: <span className="text-blue-400 font-bold">{questionCount}</span></label>
                            <input
                                id="question-count"
                                type="range"
                                min="5"
                                max="50"
                                value={questionCount}
                                onChange={(e) => setQuestionCount(Number(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>

                        <button 
                            onClick={handleGenerateQuiz} 
                            disabled={selectedTopics.length === 0}
                            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            Generate Quiz
                        </button>
                    </>
                )}
            </div>
        </Card>
    );

    const renderLoading = (message: string) => (
        <Card className="flex flex-col items-center justify-center text-center">
            <Spinner />
            <h2 className="text-2xl font-bold mt-4 text-white">{message}</h2>
            <p className="text-gray-400 mt-2">AI is crafting your experience. Please wait.</p>
        </Card>
    );

    const renderQuiz = () => {
        const question = quizData[currentQuestionIndex];
        const userAnswerIndex = userAnswers.find(a => a.questionIndex === currentQuestionIndex)?.answerIndex;
        return (
            <Card className="w-full max-w-4xl">
                <div className="mb-6">
                    <p className="text-sm font-semibold text-blue-400">Question {currentQuestionIndex + 1} of {quizData.length}</p>
                    <h2 className="text-2xl font-semibold text-white mt-2">{question.question}</h2>
                </div>
                <div className="space-y-4">
                    {question.answers.map((answer, index) => {
                        const isSelected = userAnswerIndex === index;
                        return (
                            <button
                                key={index}
                                onClick={() => handleAnswerSelect(currentQuestionIndex, index)}
                                className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 ${
                                    isSelected ? 'bg-blue-900 border-blue-500 shadow-lg' : 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
                                }`}
                            >
                                <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>{answer.text}</span>
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={handleNextQuestion}
                    disabled={userAnswerIndex === undefined}
                    className="w-full mt-8 bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                    {currentQuestionIndex === quizData.length - 1 ? 'Finish & View Results' : 'Next Question'}
                </button>
            </Card>
        );
    };

    const renderReview = () => (
        <div className="w-full max-w-5xl space-y-8">
            <Card className="text-center">
                <h2 className="text-3xl font-bold text-white">Quiz Complete!</h2>
                <p className="text-xl text-gray-300 mt-2">Your Score</p>
                <p className={`text-6xl font-bold mt-4 ${score / quizData.length >= 0.7 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {score} <span className="text-3xl text-gray-400">/ {quizData.length}</span>
                </p>
                <button 
                    onClick={handleStartOver}
                    className="mt-8 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Start New Quiz
                </button>
            </Card>

            <h3 className="text-2xl font-bold text-center text-white">Review Your Answers</h3>

            {quizData.map((question, qIndex) => {
                const userAnswer = userAnswers.find(a => a.questionIndex === qIndex);
                return (
                    <Card key={qIndex}>
                        <p className="text-sm font-semibold text-blue-400">Question {qIndex + 1}</p>
                        <h4 className="text-xl font-semibold text-white mt-2 mb-4">{question.question}</h4>
                        <div className="space-y-4">
                            {question.answers.map((answer, aIndex) => {
                                const isCorrect = answer.isCorrect;
                                const isUserAnswer = userAnswer?.answerIndex === aIndex;
                                let borderColor = 'border-gray-700';
                                if (isCorrect) borderColor = 'border-green-500';
                                else if (isUserAnswer) borderColor = 'border-red-500';
                                
                                return (
                                    <div key={aIndex} className={`p-4 rounded-lg border-2 bg-gray-900/50 ${borderColor}`}>
                                        <div className="flex justify-between items-start">
                                            <p className="font-medium text-gray-200">{answer.text}</p>
                                            {isCorrect && <span className="text-xs font-bold text-green-400 bg-green-900/50 px-2 py-1 rounded-full">CORRECT</span>}
                                            {isUserAnswer && !isCorrect && <span className="text-xs font-bold text-red-400 bg-red-900/50 px-2 py-1 rounded-full">YOUR ANSWER</span>}
                                        </div>
                                        <p className="text-sm text-gray-400 mt-2">{answer.feedback}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-700">
                             <a href={question.source.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
                                Source: {question.source.title}
                            </a>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
    
    const renderContent = () => {
        switch (appState) {
            case AppState.SETUP:
                return renderSetup();
            case AppState.ANALYZING:
                return renderLoading(loadingMessage);
            case AppState.GENERATING:
                return renderLoading(loadingMessage);
            case AppState.TAKING_QUIZ:
                return renderQuiz();
            case AppState.REVIEW:
                return renderReview();
            default:
                return renderSetup();
        }
    }

    return (
        <main className="min-h-screen w-full bg-gray-900 text-white p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-2xl">
                {renderContent()}
            </div>
        </main>
    );
};

export default App;
