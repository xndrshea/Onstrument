import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { priceClient } from '../../services/priceClient';
import { UserService } from '../../services/userService';
import { useAuth } from '../../hooks/useAuthQuery';

interface ChatMessage {
    username: string;
    message: string;
    timestamp: number;
}

const ChatIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
    </svg>
);

export function LiveChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [inputMessage, setInputMessage] = useState('');
    const [lastReadTime, setLastReadTime] = useState(() => Date.now());
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { connected, publicKey } = useWallet();
    const { user, isAuthenticated } = useAuth();

    // Update unread count when new messages arrive
    useEffect(() => {
        const newUnreadCount = messages.filter(msg => msg.timestamp > lastReadTime).length;
        setUnreadCount(newUnreadCount);
    }, [messages, lastReadTime]);

    // Mark messages as read when opening chat
    useEffect(() => {
        if (isOpen) {
            setLastReadTime(Date.now());
            setUnreadCount(0);
            messagesEndRef.current?.scrollIntoView();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!isAuthenticated || !user || !inputMessage.trim()) {
            return;
        }

        priceClient.sendChatMessage(inputMessage, user.userId);
        setInputMessage('');
    };

    useEffect(() => {
        fetch('/api/chat/history')
            .then(res => res.json())
            .then(history => setMessages(history));

        const unsubscribe = priceClient.subscribeToChatMessages((data) => {
            setMessages(prev => [...prev, data]);
        });

        return () => unsubscribe();
    }, []);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const div = e.currentTarget;
        if (div.scrollTop === 0 || div.scrollTop + div.clientHeight === div.scrollHeight) {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50">
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2 shadow-lg flex items-center gap-2"
                >
                    <span>Live Chat</span>
                    {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                            {unreadCount}
                        </span>
                    )}
                </button>
            ) : (
                <div className="bg-white rounded-lg shadow-xl w-96 h-[32rem] flex flex-col">
                    <div className="p-3 border-b flex justify-between items-center">
                        <h3 className="font-medium text-sm">Live Chat</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            ×
                        </button>
                    </div>
                    <div
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 overscroll-contain"
                    >
                        {messages.map((msg, i) => (
                            <div key={`${msg.timestamp}-${i}`} className="flex flex-col">
                                <div className="bg-gray-100 rounded-lg p-2 break-words">
                                    <div className="text-xs text-gray-500 font-medium">{msg.username}:</div>
                                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="p-3 border-t">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder="Type a message..."
                                className="flex-1 rounded-lg border p-2 text-sm"
                            />
                            <button
                                onClick={sendMessage}
                                className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
