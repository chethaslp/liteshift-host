import type { Server, Socket } from "socket.io";
import { dbHelpers } from "../lib/db";
import bcrypt from "bcryptjs";

// Get authenticated user's information
const getUserInfo = async (data: { userId: number }, callback: (response: any) => void) => {
  try {
    const { userId } = data;
    
    if (!userId) {
      callback({
        success: false,
        error: 'User ID is required'
      });
      return;
    }

    const user = dbHelpers.getUserById(userId);
    
    if (!user) {
      callback({
        success: false,
        error: 'User not found'
      });
      return;
    }

    callback({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Change user password
const changePassword = (socket: Socket) => async (data: { 
  userId: number; 
  currentPassword: string; 
  newPassword: string;
}, callback: (response: any) => void) => {
  try {
    const { userId, currentPassword, newPassword } = data;
    
    if (!userId || !currentPassword || !newPassword) {
      callback({
        success: false,
        error: 'User ID, current password, and new password are required'
      });
      return;
    }

    if (newPassword.length < 6) {
      callback({
        success: false,
        error: 'New password must be at least 6 characters long'
      });
      return;
    }

    // Get user with password hash for verification
    const user = dbHelpers.getUserWithPassword(userId) as any;
    
    if (!user) {
      callback({
        success: false,
        error: 'User not found'
      });
      return;
    }

    // Verify current password
    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, user.password_hash);
    
    if (!isCurrentPasswordValid) {
      callback({
        success: false,
        error: 'Current password is incorrect'
      });
      return;
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    
    // Update password in database
    dbHelpers.updatePassword(userId, newPasswordHash);

    callback({
      success: true,
      message: 'Password changed successfully. You will be disconnected for security.'
    });

    // Disconnect the socket after a short delay to allow the response to be sent
    setTimeout(() => {
      socket.disconnect(true);
    }, 1000);

  } catch (error) {
    console.error('Change password error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Edit user information
const editUser = async (data: { 
  userId: number; 
  username?: string; 
  email?: string; 
  role?: string;
}, callback: (response: any) => void) => {
  try {
    const { userId, username, email, role } = data;
    
    if (!userId) {
      callback({
        success: false,
        error: 'User ID is required'
      });
      return;
    }

    // Check if user exists
    const existingUser = dbHelpers.getUserById(userId);
    if (!existingUser) {
      callback({
        success: false,
        error: 'User not found'
      });
      return;
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      callback({
        success: false,
        error: 'Invalid email format'
      });
      return;
    }

    // Validate username if provided
    if (username && username.length < 3) {
      callback({
        success: false,
        error: 'Username must be at least 3 characters long'
      });
      return;
    }

    // Check if username is already taken (if changing username)
    if (username && username !== (existingUser as any).username) {
      const userWithSameUsername = dbHelpers.getUserByUsername(username);
      if (userWithSameUsername) {
        callback({
          success: false,
          error: 'Username is already taken'
        });
        return;
      }
    }

    // Validate role if provided
    if (role && !['admin', 'user'].includes(role)) {
      callback({
        success: false,
        error: 'Invalid role. Must be "admin" or "user"'
      });
      return;
    }

    // Prepare updates object
    const updates: { username?: string; email?: string; role?: string } = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;

    // Update user in database
    const result = dbHelpers.updateUser(userId, updates);
    
    if (!result || result.changes === 0) {
      callback({
        success: false,
        error: 'No changes were made'
      });
      return;
    }

    // Get updated user info
    const updatedUser = dbHelpers.getUserById(userId);

    callback({
      success: true,
      message: 'User information updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Edit user error:', error);
    
    // Handle specific database errors
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      if (error.message.includes('username')) {
        callback({
          success: false,
          error: 'Username is already taken'
        });
      } else if (error.message.includes('email')) {
        callback({
          success: false,
          error: 'Email is already taken'
        });
      } else {
        callback({
          success: false,
          error: 'A field you\'re trying to update must be unique'
        });
      }
    } else {
      callback({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }
};

export default (server: Server, socket: Socket) => {
  socket.on("user:get", getUserInfo);
  socket.on("user:changePassword", changePassword(socket));
  socket.on("user:edit", editUser);
}