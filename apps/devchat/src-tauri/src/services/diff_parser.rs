pub fn count_diff_lines(raw_diff: &str) -> (usize, usize) {
    raw_diff.lines().fold((0, 0), |(additions, deletions), line| {
        if line.starts_with('+') && !line.starts_with("+++") {
            (additions + 1, deletions)
        } else if line.starts_with('-') && !line.starts_with("---") {
            (additions, deletions + 1)
        } else {
            (additions, deletions)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::count_diff_lines;

    #[test]
    fn ignores_file_headers() {
        let (additions, deletions) = count_diff_lines("--- a/a\n+++ b/a\n-old\n+new");
        assert_eq!((additions, deletions), (1, 1));
    }
}
