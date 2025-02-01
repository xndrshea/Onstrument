import React from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
}

export function Modal({ isOpen, onClose, children }: ModalProps) {
    useScrollLock(isOpen)

    if (!isOpen) return null

    return (
        <>
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <div
                        className="bg-white rounded-lg p-6 w-full max-w-xl relative"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
                            onClick={onClose}
                        >
                            ×
                        </button>
                        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
} 