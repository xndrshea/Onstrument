import React, { useEffect, useRef } from 'react'
import { Chart } from 'chart.js/auto'
import { BondingCurve } from '../../services/bondingCurve'

interface PriceChartProps {
    bondingCurve: BondingCurve
    currentSupply: number
    maxSupply: number
}

export function PriceChart({ bondingCurve, currentSupply, maxSupply }: PriceChartProps) {
    const chartRef = useRef<HTMLCanvasElement>(null)
    const chartInstance = useRef<Chart>()

    useEffect(() => {
        if (!chartRef.current) return

        // Generate data points
        const dataPoints = 100
        const supplyStep = (maxSupply - currentSupply) / dataPoints
        const data = Array.from({ length: dataPoints }, (_, i) => {
            const supply = (currentSupply + (i * supplyStep)) / Math.pow(10, 9)
            return {
                x: supply,
                y: bondingCurve.getCurrentPrice(supply)
            }
        })

        // Create chart
        if (chartInstance.current) {
            chartInstance.current.destroy()
        }

        chartInstance.current = new Chart(chartRef.current, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Token Price',
                    data,
                    borderColor: '#4CAF50',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Supply (Tokens)'
                        },
                        ticks: {
                            callback: (value) => `${Number(value).toLocaleString()}`
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price (SOL)'
                        },
                        ticks: {
                            callback: (value) => `${Number(value).toFixed(6)}`
                        }
                    }
                }
            }
        })

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy()
            }
        }
    }, [bondingCurve, currentSupply, maxSupply])

    return <canvas ref={chartRef} />
} 