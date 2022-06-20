import { OptionValues } from 'commander'
import type { BrowserContext, Page } from 'playwright-chromium'

export interface GarminCommandOptions extends OptionValues {
  authenticate?: boolean
  debug?: boolean
  outputFile: string
  month?: string
  failWhenZero?: boolean
}

export interface GarminDataItem {
  id: number
  groupId: null | string
  trainingPlanId: null | string
  itemType: string
  activityTypeId: number
  wellnessActivityUuid: null | string
  title: string
  date: string
  duration: number
  distance: number
  calories: number
  floorsClimbed: null | number
  avgRespirationRate: null | number
  unitOfPoolLength?: {
    unitId: number
    unitKey: string
    factor: number
  }
  weight: null | number
  difference: null | number
  courseId: null | number
  courseName: null | string
  sportTypeKey: null | string
  url: null | string
  isStart: null | boolean
  isRace: null | boolean
  recurrenceId: null | string
  isParent: boolean
  parentId: null | string
  userBadgeId: null | string
  badgeCategoryTypeId: null | string
  badgeCategoryTypeDesc: null | string
  badgeAwardedDate: null | string
  badgeViewed: null | boolean
  hideBadge: null | boolean
  startTimestampLocal: string
  eventTimeLocal: null | string
  diveNumber: null | string
  maxDepth: null | number
  avgDepth: null | number
  surfaceInterval: null | number
  elapsedDuration: number
  lapCount: null | number
  bottomTime: null | number
  atpPlanId: null | string
  workoutId: null | string
  protectedWorkoutSchedule: boolean
  activeSets: null | number
  strokes: number
  noOfSplits: null | number
  maxGradeValue: null | number
  totalAscent: null | number
  climbDuration: null | number
  maxSpeed: number
  averageHR: number
  activeSplitSummaryDuration: null | number
  maxSplitDistance: null | number
  maxSplitSpeed: null | number
  location: null | string
  shareableEventUuid: null | string
  splitSummaryMode: null | string
  completionTarget: null | string
  phasedTrainingPlan: null | string
  autoCalcCalories: boolean
  decoDive: boolean
  primaryEvent: null | string
  shareableEvent: boolean
  subscribed: null | boolean
  timestamp: number
}

export interface fetchDataConfig {
  context: BrowserContext
  page: Page
  forceAuth: boolean
}
