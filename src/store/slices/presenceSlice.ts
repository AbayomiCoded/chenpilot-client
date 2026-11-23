import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserPresence, PresenceStatus } from '@/services/presenceService';

interface PresenceState {
  users: { [userId: string]: UserPresence };
  onlineCount: number;
  awayCount: number;
}

const initialState: PresenceState = {
  users: {},
  onlineCount: 0,
  awayCount: 0,
};

const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    addOrUpdatePresence: (state, action: PayloadAction<UserPresence>) => {
      const presence = action.payload;
      const oldPresence = state.users[presence.userId];

      // Update user presence
      state.users[presence.userId] = presence;

      // Update counts
      if (oldPresence?.status === 'online' && presence.status !== 'online') {
        state.onlineCount = Math.max(0, state.onlineCount - 1);
      } else if (oldPresence?.status !== 'online' && presence.status === 'online') {
        state.onlineCount += 1;
      }

      if (oldPresence?.status === 'away' && presence.status !== 'away') {
        state.awayCount = Math.max(0, state.awayCount - 1);
      } else if (oldPresence?.status !== 'away' && presence.status === 'away') {
        state.awayCount += 1;
      }
    },

    removePresence: (state, action: PayloadAction<string>) => {
      const userId = action.payload;
      const presence = state.users[userId];

      if (presence) {
        if (presence.status === 'online') {
          state.onlineCount = Math.max(0, state.onlineCount - 1);
        } else if (presence.status === 'away') {
          state.awayCount = Math.max(0, state.awayCount - 1);
        }

        delete state.users[userId];
      }
    },

    removePresences: (state, action: PayloadAction<string[]>) => {
      action.payload.forEach((userId) => {
        const presence = state.users[userId];
        if (presence) {
          if (presence.status === 'online') {
            state.onlineCount = Math.max(0, state.onlineCount - 1);
          } else if (presence.status === 'away') {
            state.awayCount = Math.max(0, state.awayCount - 1);
          }

          delete state.users[userId];
        }
      });
    },

    clearPresence: (state) => {
      state.users = {};
      state.onlineCount = 0;
      state.awayCount = 0;
    },

    updateUserStatus: (
      state,
      action: PayloadAction<{ userId: string; status: PresenceStatus }>,
    ) => {
      const { userId, status } = action.payload;
      const presence = state.users[userId];

      if (presence) {
        const oldStatus = presence.status;
        presence.status = status;
        presence.lastSeen = new Date().toISOString();

        // Update counts
        if (oldStatus === 'online') {
          state.onlineCount = Math.max(0, state.onlineCount - 1);
        } else if (oldStatus === 'away') {
          state.awayCount = Math.max(0, state.awayCount - 1);
        }

        if (status === 'online') {
          state.onlineCount += 1;
        } else if (status === 'away') {
          state.awayCount += 1;
        }
      }
    },

    setPresenceBatch: (state, action: PayloadAction<UserPresence[]>) => {
      state.users = {};
      state.onlineCount = 0;
      state.awayCount = 0;

      action.payload.forEach((presence) => {
        state.users[presence.userId] = presence;
        if (presence.status === 'online') state.onlineCount += 1;
        if (presence.status === 'away') state.awayCount += 1;
      });
    },
  },
});

export const {
  addOrUpdatePresence,
  removePresence,
  removePresences,
  clearPresence,
  updateUserStatus,
  setPresenceBatch,
} = presenceSlice.actions;

export default presenceSlice.reducer;
