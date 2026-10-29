import { createContext, useContext } from 'react';

/** What the server list knows about a card's game, for the card view it draws inside its link. */
export interface CardGame {
    /** The egg's name, such as Paper. */
    game: string | null;
    /** The egg's own logo. */
    logo: string | null;
    tags: readonly string[] | undefined;
    /** The game's color when cards show the game by color. */
    color: string | null;
}

export const CardGameContext = createContext<CardGame | null>(null);

export const useCardGame = () => useContext(CardGameContext);
