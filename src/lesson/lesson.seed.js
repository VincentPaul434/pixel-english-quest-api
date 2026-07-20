export const lessons = [
  {
    id: 'moonlit-map',
    category: 'reading',
    title: 'The Moonlit Map',
    eyebrow: 'Book worm',
    icon: '📗',
    minutes: 6,
    difficulty: 'Beginner',
    passage: 'Milo found a silver map beneath an old floorboard. It showed no roads in daylight, but under the moon, a bright path appeared. The path led past the sleeping village and into a quiet pine forest. Milo packed a lantern, a warm scarf, and enough courage for one small adventure.',
    questions: [
      { prompt: 'When did the path appear?', choices: ['At sunrise', 'Under the moon', 'During rain'], answer: 1 },
      { prompt: 'What did Milo pack?', choices: ['A lantern and scarf', 'A boat and rope', 'A golden crown'], answer: 0 }
    ]
  },
  {
    id: 'lost-compass',
    category: 'reading',
    title: 'The Lost Compass',
    eyebrow: 'Book worm',
    icon: '🧭',
    minutes: 7,
    difficulty: 'Beginner',
    passage: 'At the edge of the Whispering Woods, Aya discovered a brass compass. Its needle did not point north. Instead, it turned toward anyone who needed help. Aya followed it across a stream and found a young fox trapped between two fallen branches. After she freed the fox, the needle finally became still.',
    questions: [
      { prompt: 'What did the compass point toward?', choices: ['North', 'Treasure', 'Someone who needed help'], answer: 2 },
      { prompt: 'Who did Aya help?', choices: ['A young fox', 'A lost knight', 'A sleepy owl'], answer: 0 }
    ]
  },
  {
    id: 'tense-keep',
    category: 'grammar',
    title: 'Tense Keep',
    eyebrow: 'Grammar',
    icon: '📜',
    minutes: 5,
    difficulty: 'Beginner',
    passage: 'Past tense describes something that already happened. Many regular verbs add “-ed”. For example: “The wizard opens the gate” becomes “The wizard opened the gate.” Some verbs are irregular: “go” becomes “went,” and “see” becomes “saw.”',
    questions: [
      { prompt: 'Choose the correct past tense: “The knight ___ home.”', choices: ['go', 'went', 'going'], answer: 1 },
      { prompt: 'Choose the correct sentence.', choices: ['Lina opened the chest.', 'Lina open the chest yesterday.', 'Lina opening the chest.'], answer: 0 }
    ]
  },
  {
    id: 'sentence-forge',
    category: 'grammar',
    title: 'Sentence Forge',
    eyebrow: 'Grammar',
    icon: '⚒️',
    minutes: 6,
    difficulty: 'Intermediate',
    passage: 'A complete sentence needs a subject and a verb. The subject tells us who or what the sentence is about. The verb tells us what the subject does or is. “The blue dragon sleeps” is complete: “dragon” is the subject and “sleeps” is the verb.',
    questions: [
      { prompt: 'Which is a complete sentence?', choices: ['Under the tower.', 'The raven sings.', 'Very quietly.'], answer: 1 },
      { prompt: 'What is the verb in “The blue dragon sleeps”?', choices: ['blue', 'dragon', 'sleeps'], answer: 2 }
    ]
  },
  {
    id: 'whispering-woods',
    category: 'listening',
    title: 'Whispering Woods',
    eyebrow: 'Listening',
    icon: '🎧',
    minutes: 4,
    difficulty: 'Beginner',
    passage: 'Listen carefully, traveler. The safest trail is beside the river. Cross the wooden bridge, then turn left at the tallest pine tree. The lantern at the cabin will guide you home.',
    audioText: 'The safest trail is beside the river. Cross the wooden bridge, then turn left at the tallest pine tree.',
    questions: [
      { prompt: 'Where is the safest trail?', choices: ['Beside the river', 'Behind the castle', 'Across the mountain'], answer: 0 },
      { prompt: 'Where should the traveler turn left?', choices: ['At the bridge', 'At the cabin', 'At the tallest pine'], answer: 2 }
    ]
  },
  {
    id: 'tavern-greetings',
    category: 'speaking',
    title: 'Tavern Greetings',
    eyebrow: 'Speaking',
    icon: '🎙️',
    minutes: 4,
    difficulty: 'Beginner',
    passage: 'A clear greeting can start a friendly conversation. Read the phrase aloud, then notice its rhythm: “Good evening! Could you please show me the way to the village?” Speak slowly and make each word easy to hear.',
    speakPhrase: 'Good evening! Could you please show me the way to the village?',
    questions: [
      { prompt: 'Which phrase is the most polite?', choices: ['Move now.', 'Could you please help me?', 'You help.'], answer: 1 },
      { prompt: 'Which greeting suits the evening?', choices: ['Good evening', 'Good morning', 'Good noon-night'], answer: 0 }
    ]
  }
];

export const quickQuestions = [
  { id: 'q1', prompt: 'Which word is a synonym for “brave”?', choices: ['Courageous', 'Silent', 'Tiny'], answer: 0, explanation: 'Courageous means brave or willing to face danger.' },
  { id: 'q2', prompt: 'Choose the correctly spelled word.', choices: ['Adventurre', 'Adventure', 'Adventur'], answer: 1, explanation: 'Adventure is spelled with one r at the end.' },
  { id: 'q3', prompt: 'Complete the sentence: “She ___ a book every night.”', choices: ['read', 'reads', 'reading'], answer: 1, explanation: 'Use “reads” with the third-person singular subject “she.”' },
  { id: 'q4', prompt: 'Which sentence is a question?', choices: ['The castle is old.', 'Open the gate.', 'Where is the castle?'], answer: 2, explanation: 'A direct question ends with a question mark.' }
];
