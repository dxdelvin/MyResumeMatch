// Blog Post JavaScript
let currentPost = null;
let relatedPosts = [];

// Check if user is authenticated
function isUserAuthenticated() {
  const savedUser = localStorage.getItem("user");
  return savedUser && savedUser !== 'null' && savedUser !== 'undefined' && savedUser.trim() !== '';
}

// Get user data from localStorage
function getUserData() {
  const savedUser = localStorage.getItem("user");
  if (savedUser && savedUser !== 'null' && savedUser !== 'undefined') {
    try {
      return JSON.parse(savedUser);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Check authentication and show/hide create blog link
document.addEventListener('DOMContentLoaded', function() {
  // Call updateAuthUI from auth.js to handle navbar
  if (typeof updateAuthUI === 'function') {
    updateAuthUI();
  }
  checkAuthenticationAndShowCreateBlogLink();
  loadBlogPost();
});

function checkAuthenticationAndShowCreateBlogLink() {
  const user = getUserData();
  const createBlogLink = document.getElementById('create-blog-link');
  
  if (!user || user.email !== 'dxdelvin@gmail.com') {
    if (createBlogLink) createBlogLink.style.display = 'none';
    return;
  }
  
  if (createBlogLink) createBlogLink.style.display = 'inline-block';
}

async function loadBlogPost() {
  const slug = window.location.pathname.split('/').pop();
  console.log('Loading blog post with slug:', slug);
  
  try {
    const response = await fetch(`/api/blog/posts/${slug}`);
    console.log('API Response status:', response.status, response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (!response.ok) {
      const error = await response.text();
      console.error('API Error Response:', error);
      if (response.status === 404) {
        showError('Article not found');
        showToast('Article not found', 'error');
      } else {
        showError(`Error loading article: ${response.status}`);
        showToast(`Error loading article: ${response.status}`, 'error');
      }
      return;
    }
    
    // Get raw text first for debugging
    const responseText = await response.text();
    console.log('Raw response length:', responseText.length);
    console.log('First 200 chars:', responseText.substring(0, 200));
    
    try {
      const post = JSON.parse(responseText);
      console.log('Post loaded successfully:', post);
      currentPost = post;
      renderBlogPost(post);
      updateMetaTags(post);
      loadRelatedPosts(post.category);
      
      // Check if user is logged in and show comments section
      const isAuthenticated = isUserAuthenticated();
      console.log('User authenticated:', isAuthenticated);
      
      if (isAuthenticated) {
        document.getElementById('comments-section').style.display = 'block';
        document.getElementById('comments-login-section').style.display = 'none';
        loadComments(post.id);
        
        // Store user data for comment submission
        const user = getUserData();
        if (user) {
          localStorage.setItem('commentUser', JSON.stringify(user));
        }
      } else {
        // User not logged in - show login prompt and hide comments form
        document.getElementById('comments-section').style.display = 'none';
        document.getElementById('comments-login-section').style.display = 'block';
        // Initialize Google Sign-In in the comments section
        initializeCommentsSignIn();
      }
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      console.error('Response text was:', responseText);
      showError('Error parsing article data: ' + jsonError.message);
      showToast('Error parsing article data: ' + jsonError.message, 'error');
    }
    
  } catch (error) {
    console.error('Error loading blog post:', error);
    showError('Error loading article: ' + error.message);
    showToast('Error loading article: ' + error.message, 'error');
  }
}

function renderBlogPost(post) {
  const container = document.getElementById('blog-post-content');
  
  const tags = post.tags ? post.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
  
  let html = `
    <a href="/blog" class="back-to-blog">
      ← Back to Blog
    </a>
    
    <article>
      <header class="blog-post-header">
        ${post.category ? `<div class="blog-post-category">${post.category}</div>` : ''}
        <h1 class="blog-post-title">${post.title}</h1>
        <div class="blog-post-meta">
          <span class="blog-post-author">${post.author_name}</span>
          <span>•</span>
          <span>${formatDate(post.created_at)}</span>
          <span>•</span>
          <span>${post.read_time_minutes} min read</span>
        </div>
      </header>
      
      ${post.featured_image ? `<img src="${post.featured_image}" alt="${post.title}" class="blog-post-featured-image">` : ''}
      
      <div class="blog-post-content">
        ${formatContent(post.content)}
      </div>
      
      <div class="blog-post-actions">
        <button id="like-btn" class="like-btn" title="Like this article">
          <span class="like-icon">♡</span>
          <span id="like-count">0</span>
        </button>
      </div>
      
      <footer class="blog-post-footer">
        ${tags.length > 0 ? `
          <div class="blog-post-tags">
            ${tags.map(tag => `<span class="blog-post-tag">#${tag}</span>`).join('')}
          </div>
        ` : ''}
        
        <div class="blog-post-navigation" id="related-posts">
          <div class="loading-spinner">Loading related articles...</div>
        </div>
      </footer>
    </article>
    
    <!-- Login Prompt for Comments -->
    <section class="comments-login-section" id="comments-login-section" style="display: block;">
      <div class="comments-login-container">
        <h2>Join the Discussion</h2>
        <p>Sign in with your Google account to leave a comment and join our community.</p>
        <div id="comments-auth-section" class="comments-auth-wrapper"></div>
      </div>
    </section>
    
    <!-- Comments Section -->
    <section class="comments-section" id="comments-section" style="display: none;">
      <div class="comments-container">
        <h2 class="comments-title">Comments</h2>
        
        <!-- Comment Form -->
        <div class="comment-form-wrapper">
          <h3 class="comment-form-title">Leave a Comment</h3>
          <form id="comment-form" class="comment-form">
            <div class="form-group">
              <label for="comment-content">Comment *</label>
              <textarea 
                id="comment-content" 
                name="content" 
                required 
                placeholder="Share your thoughts... (max 5000 characters)"
                rows="5"
                maxlength="5000"
              ></textarea>
              <small class="char-count"><span id="char-count">0</span>/5000</small>
            </div>
            
            <button type="submit" class="btn-submit-comment">Post Comment</button>
          </form>
        </div>
        
        <!-- Comments List -->
        <div class="comments-list-wrapper">
          <h3 class="comments-list-title" id="comments-count">Comments</h3>
          <div id="comments-list" class="comments-list">
            <div class="loading-spinner">Loading comments...</div>
          </div>
        </div>
      </div>
    </section>
  `;
  
  container.innerHTML = html;
  
  // Add event listeners
  document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
  document.getElementById('comment-content').addEventListener('input', updateCharCount);
  document.getElementById('like-btn').addEventListener('click', handleLikePost);
  
  // Load like status
  loadLikeStatus();
}

function formatContent(content) {
  const applyInline = (text) => {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  };

  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inList = false;
  let inCode = false;
  let listTag = 'ul';
  let codeBuffer = [];

  const flushList = () => {
    if (inList) {
      html += `</${listTag}>`;
      inList = false;
    }
  };

  const flushCode = () => {
    if (inCode) {
      html += `<pre><code>${codeBuffer.join('\n')}</code></pre>`;
      codeBuffer = [];
      inCode = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Code fences
    if (line.startsWith('```')) {
      if (inCode) {
        flushCode();
      } else {
        flushList();
        inCode = true;
        codeBuffer = [];
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = applyInline(headingMatch[2]);
      html += `<h${level}>${text}</h${level}>`;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushList();
      html += `<blockquote>${applyInline(trimmed.replace(/^>\s*/, ''))}</blockquote>`;
      continue;
    }

    // Lists
    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (unorderedMatch || orderedMatch) {
      const currentListTag = orderedMatch ? 'ol' : 'ul';
      const itemText = applyInline(unorderedMatch ? unorderedMatch[1] : orderedMatch[1]);
      if (!inList || listTag !== currentListTag) {
        flushList();
        listTag = currentListTag;
        inList = true;
        html += `<${listTag}>`;
      }
      html += `<li>${itemText}</li>`;
      continue;
    }

    // Paragraphs or blank lines
    if (trimmed === '') {
      flushList();
      html += '<br />';
    } else {
      flushList();
      html += `<p>${applyInline(trimmed)}</p>`;
    }
  }

  flushList();
  flushCode();
  return html;
}

async function loadRelatedPosts(category) {
  if (!category) {
    document.getElementById('related-posts').innerHTML = '';
    return;
  }
  
  try {
    const response = await fetch(`/api/blog/posts?published_only=true&category=${category}&limit=6`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const posts = await response.json();
    
    // Filter out current post
    const relatedPosts = posts.filter(post => post.slug !== currentPost.slug);
    renderRelatedPosts(relatedPosts.slice(0, 2));
    
  } catch (error) {
    console.error('Error loading related posts:', error);
    document.getElementById('related-posts').innerHTML = '';
  }
}

function renderRelatedPosts(posts) {
  const container = document.getElementById('related-posts');
  
  if (posts.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  
  if (posts.length >= 1) {
    html += `
      <a href="/blog/${posts[0].slug}" class="nav-card nav-card-prev">
        <div class="nav-card-label">Previous Article</div>
        <div class="nav-card-title">${posts[0].title}</div>
      </a>
    `;
  }
  
  if (posts.length >= 2) {
    html += `
      <a href="/blog/${posts[1].slug}" class="nav-card nav-card-next">
        <div class="nav-card-label">Next Article</div>
        <div class="nav-card-title">${posts[1].title}</div>
      </a>
    `;
  }
  
  container.innerHTML = html;
}

function updateMetaTags(post) {
  document.title = `${post.title} | ResumeAI Blog`;
  
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.content = post.meta_description || post.excerpt || post.content.substring(0, 160);
  }
  
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    ogTitle.content = post.title;
  }
  
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) {
    ogDescription.content = post.meta_description || post.excerpt || post.content.substring(0, 160);
  }
  
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && post.featured_image) {
    ogImage.content = post.featured_image;
  }
}

function initializeCommentsSignIn() {
  const authSection = document.getElementById('comments-auth-section');
  if (authSection) {
    authSection.innerHTML = '<div class="g_id_signin" data-type="standard" data-size="large" data-theme="filled_blue" data-text="signin" data-shape="rectangular" data-logo_alignment="left"></div>';
    
    // Re-render Google Sign-In button if library is loaded
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.renderButton(
        authSection.querySelector('.g_id_signin'),
        {
          type: 'standard',
          size: 'large',
          theme: 'filled_blue',
          text: 'signin',
          shape: 'rectangular',
          logo_alignment: 'left'
        }
      );
    }
  }
}

function showError(message) {
  const container = document.getElementById('blog-post-content');
  container.innerHTML = `
    <div class="error-message">
      <h1>${message}</h1>
      <p>The article you're looking for might not exist or has been removed.</p>
      <a href="/blog" style="color: #0a66c2; font-weight: 600;">← Back to Blog</a>
    </div>
  `;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Comment Functions
async function loadComments(postId) {
  try {
    const response = await fetch(`/api/blog/comments/post/${postId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const comments = await response.json();
    renderComments(comments);
  } catch (error) {
    console.error('Error loading comments:', error);
    document.getElementById('comments-list').innerHTML = 
      '<p class="no-comments">No comments yet. Be the first to comment!</p>';
  }
}

function renderComments(comments) {
  const container = document.getElementById('comments-list');
  const countElement = document.getElementById('comments-count');
  
  countElement.textContent = `Comments (${comments.length})`;
  
  if (comments.length === 0) {
    container.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
    return;
  }
  
  let html = '';
  comments.forEach(comment => {
    html += `
      <div class="comment-item">
        <div class="comment-header">
          <strong class="comment-author">${escapeHtml(comment.author_name)}</strong>
          <span class="comment-date">${formatDate(comment.created_at)}</span>
        </div>
        <div class="comment-content">
          ${escapeHtml(comment.content).replace(/\n/g, '<br>')}
        </div>
        <div class="comment-actions">
          <button class="comment-like-btn" data-comment-id="${comment.id}" onclick="handleCommentLike(event, ${comment.id})">
            <span class="like-icon">♡</span>
            <span class="like-count">0</span>
          </button>
          <span class="comment-reply">Reply</span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Load like counts for all comments
  comments.forEach(comment => {
    loadCommentLikes(comment.id);
  });
}

async function handleCommentSubmit(e) {
  e.preventDefault();
  
  const contentInput = document.getElementById('comment-content');
  const submitBtn = e.target.querySelector('.btn-submit-comment');
  
  // Validate
  if (!contentInput.value.trim()) {
    showToast('Please enter a comment', 'error');
    return;
  }
  
  if (contentInput.value.trim().length > 5000) {
    showToast('Comment is too long (max 5000 characters)', 'error');
    return;
  }
  
  // Get user data
  const user = getUserData();
  if (!user) {
    showToast('Please log in to comment', 'error');
    return;
  }
  
  // Show loading state
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Posting...';
  
  try {
    const response = await fetch('/api/blog/comments/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        author_name: user.name || user.email.split('@')[0],
        author_email: user.email,
        content: contentInput.value.trim(),
        post_id: currentPost.id
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to post comment');
    }
    
    // Reset form
    document.getElementById('comment-form').reset();
    updateCharCount();
    
    // Show success message
    showToast('Thank you! Your comment has been submitted and will appear after moderation.', 'success');
    
    // Reload comments
    loadComments(currentPost.id);
    
  } catch (error) {
    console.error('Error posting comment:', error);
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

function updateCharCount() {
  const textarea = document.getElementById('comment-content');
  const countSpan = document.getElementById('char-count');
  if (textarea && countSpan) {
    countSpan.textContent = textarea.value.length;
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Listen for storage changes (login/logout in other tabs)
window.addEventListener('storage', function(event) {
  if (event.key === 'user') {
    // User logged in or out in another tab
    if (typeof updateAuthUI === 'function') {
      updateAuthUI();
    }
    checkAuthenticationAndShowCreateBlogLink();
    
    // Reload the page to update comments section
    if (currentPost) {
      location.reload();
    }
  }
});

// Like/Unlike blog post
async function handleLikePost() {
  const likeBtn = document.getElementById('like-btn');
  if (!likeBtn) return;
  
  const user = getUserData();
  if (!user) {
    showToast('Please log in to like articles', 'error');
    return;
  }
  
  if (!currentPost) {
    showToast('Unable to like article', 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/blog/posts/${currentPost.id}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_email: user.email
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to like post');
    }
    
    const data = await response.json();
    
    // Update button state
    const isLiked = data.liked;
    if (isLiked) {
      likeBtn.classList.add('liked');
      showToast('Added to liked articles', 'success');
    } else {
      likeBtn.classList.remove('liked');
      showToast('Removed from liked articles', 'success');
    }
    
    // Update like count
    document.getElementById('like-count').textContent = data.total_likes || 0;
    
  } catch (error) {
    console.error('Error liking post:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}

// Load like status when post loads
async function loadLikeStatus() {
  if (!currentPost) return;
  
  try {
    const user = getUserData();
    
    // Get total likes and check current user's like status
    const response = await fetch(`/api/blog/posts/${currentPost.id}/likes`);
    if (!response.ok) return;
    
    const data = await response.json();
    document.getElementById('like-count').textContent = data.total_likes || 0;
    
    // Check if current user liked it
    if (user) {
      // Check if this user has liked the post
      const likeCheckResponse = await fetch(`/api/blog/posts/${currentPost.id}/user-like/${encodeURIComponent(user.email)}`);
      if (likeCheckResponse.ok) {
        const likeData = await likeCheckResponse.json();
        if (likeData.user_liked) {
          const likeBtn = document.getElementById('like-btn');
          if (likeBtn) likeBtn.classList.add('liked');
        }
      }
    }
  } catch (error) {
    console.error('Error loading like status:', error);
  }
}

// Comment Like Functions
async function handleCommentLike(event, commentId) {
  event.preventDefault();
  
  const user = getUserData();
  if (!user) {
    showToast('Please log in to like comments', 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/blog/comments/${commentId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_email: user.email
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to like comment');
    }
    
    const data = await response.json();
    const likeBtn = event.target.closest('.comment-like-btn');
    
    if (data.liked) {
      likeBtn.classList.add('liked');
    } else {
      likeBtn.classList.remove('liked');
    }
    
    likeBtn.querySelector('.like-count').textContent = data.total_likes || 0;
  } catch (error) {
    console.error('Error liking comment:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}

async function loadCommentLikes(commentId) {
  try {
    const response = await fetch(`/api/blog/comments/${commentId}/likes`);
    if (!response.ok) return;
    
    const data = await response.json();
    const likeBtn = document.querySelector(`.comment-like-btn[data-comment-id="${commentId}"]`);
    if (likeBtn) {
      likeBtn.querySelector('.like-count').textContent = data.total_likes || 0;
      
      // Check if current user liked it
      const user = getUserData();
      if (user && data.user_liked) {
        likeBtn.classList.add('liked');
      }
    }
  } catch (error) {
    console.error('Error loading comment likes:', error);
  }
}
