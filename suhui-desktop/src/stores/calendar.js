/* 日历/时光隧道共享状态（Phase 4）：当前浏览的年月 */
import { defineStore } from 'pinia'

const now = new Date()

export const useCalendarStore = defineStore('calendar', {
  state: () => ({
    year: now.getFullYear(),
    month: now.getMonth(),      // 0-11
    selectedDay: null           // yyyy-MM-dd（右侧「这一天」面板）
  })
})
